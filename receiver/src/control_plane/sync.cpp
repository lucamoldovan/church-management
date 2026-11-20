#include "veyra/control_plane/sync.hpp"

#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <openssl/evp.h>

#include <algorithm>
#include <array>
#include <cerrno>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <fcntl.h>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <system_error>
#include <sys/stat.h>
#include <unistd.h>
#include <unordered_set>
#include <utility>

namespace veyra::control_plane {
namespace {
using Json = nlohmann::json;
constexpr std::size_t kMaxResponseBytes = 20U * 1024U * 1024U + 1024U * 1024U;
constexpr std::uint64_t kMaxPlaylistBytes = 512U * 1024U * 1024U;

struct Response {
    long status{0};
    std::string body;
    std::string error;
};

std::size_t writeBody(const char* data, std::size_t size, std::size_t count, void* user) {
    const auto bytes = size * count;
    auto* body = static_cast<std::string*>(user);
    if (bytes > kMaxResponseBytes - body->size()) return 0;
    body->append(data, bytes);
    return bytes;
}

int transferProgress(void* context, curl_off_t, curl_off_t, curl_off_t, curl_off_t) {
    const auto* stopToken = static_cast<const std::stop_token*>(context);
    return stopToken->stop_requested() ? 1 : 0;
}

Response get(const std::string& base, const std::string& path,
             const std::string& token, const std::filesystem::path& caPath,
             const std::stop_token& stopToken) {
    Response response;
    CURL* curl = curl_easy_init();
    if (!curl) { response.error = "could not create sync request"; return response; }
    curl_slist* headers = nullptr;
    const std::string auth = "Authorization: Bearer " + token;
    headers = curl_slist_append(headers, auth.c_str());
    headers = curl_slist_append(headers, "Accept: application/json, image/png, image/jpeg, image/webp");
    const std::string url = base + path;
    std::array<char, CURL_ERROR_SIZE> error{};
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeBody);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response.body);
    curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, error.data());
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, 1500L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, 10000L);
    curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, transferProgress);
    curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &stopToken);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "Veyra/0.1.0");
    const auto ca = caPath.string();
    if (!ca.empty()) curl_easy_setopt(curl, CURLOPT_CAINFO, ca.c_str());
    const auto result = curl_easy_perform(curl);
    if (result == CURLE_OK) curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response.status);
    else response.error = error[0] ? error.data() : curl_easy_strerror(result);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return response;
}

std::string sha256(const std::string& bytes) {
    std::array<unsigned char, EVP_MAX_MD_SIZE> digest{};
    unsigned int length = 0;
    EVP_MD_CTX* context = EVP_MD_CTX_new();
    if (!context) throw std::runtime_error("Could not allocate SHA-256 context");
    const bool ok = EVP_DigestInit_ex(context, EVP_sha256(), nullptr) == 1 &&
        EVP_DigestUpdate(context, bytes.data(), bytes.size()) == 1 &&
        EVP_DigestFinal_ex(context, digest.data(), &length) == 1;
    EVP_MD_CTX_free(context);
    if (!ok || length != 32) throw std::runtime_error("Could not calculate media SHA-256");
    static constexpr char hex[] = "0123456789abcdef";
    std::string result;
    result.reserve(64);
    for (unsigned int i = 0; i < length; ++i) {
        result.push_back(hex[digest[i] >> 4]);
        result.push_back(hex[digest[i] & 0x0f]);
    }
    return result;
}

bool validMediaId(const std::string& value) {
    return !value.empty() && value.size() <= 64 &&
        std::all_of(value.begin(), value.end(), [](unsigned char c) {
            return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                   (c >= '0' && c <= '9') || c == '-';
        });
}

bool validHash(const std::string& value) {
    return value.size() == 64 && std::all_of(value.begin(), value.end(), [](unsigned char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    });
}

std::string extensionFor(const std::string& mime) {
    if (mime == "image/png") return ".png";
    if (mime == "image/jpeg") return ".jpg";
    if (mime == "image/webp") return ".webp";
    throw std::runtime_error("Unsupported media MIME type in receiver manifest");
}

std::unordered_set<std::string> previousStateFiles(const std::filesystem::path& statePath) {
    std::unordered_set<std::string> files;
    try {
        struct stat stateInfo{};
        if (::lstat(statePath.c_str(), &stateInfo) != 0 || !S_ISREG(stateInfo.st_mode)) return files;
        std::ifstream input(statePath);
        if (!input) return files;
        Json state;
        input >> state;
        if (!state.contains("items") || !state["items"].is_array()) return files;
        for (const auto& item : state["items"]) {
            const auto hash = item.value("sha256", "");
            const auto mime = item.value("mimeType", "");
            if (!validHash(hash)) continue;
            try {
                files.insert(hash + extensionFor(mime));
            } catch (...) {
                // Ignore invalid metadata from an older/corrupt cache manifest.
            }
        }
    } catch (...) {
        // A corrupt old manifest must not block a fresh synchronization.
    }
    return files;
}

void ensurePrivateDirectory(const std::filesystem::path& path) {
    const auto absolute = std::filesystem::absolute(path).lexically_normal();
    const char* homeEnvironment = std::getenv("HOME");
    const auto home = homeEnvironment == nullptr
        ? std::filesystem::path{} : std::filesystem::path(homeEnvironment).lexically_normal();
    if (absolute == std::filesystem::current_path() || (!home.empty() && absolute == home)) {
        throw std::runtime_error("Receiver cache path must be a dedicated subdirectory");
    }
    static const std::array<std::filesystem::path, 17> unsafeTargets{
        "/", "/tmp", "/var", "/var/cache", "/var/lib", "/home", "/root",
        "/etc", "/usr", "/opt", "/run", "/mnt", "/media", "/dev", "/proc",
        "/sys", "/boot"
    };
    if (std::find(unsafeTargets.begin(), unsafeTargets.end(), absolute) != unsafeTargets.end()) {
        throw std::runtime_error("Receiver cache path must be a dedicated subdirectory, not a shared system directory");
    }
    std::filesystem::create_directories(absolute);
    struct stat info{};
    if (::lstat(absolute.c_str(), &info) != 0 || !S_ISDIR(info.st_mode) || S_ISLNK(info.st_mode))
        throw std::runtime_error("Receiver cache path must be a real directory, not a symlink");
    if (::chmod(absolute.c_str(), S_IRWXU) != 0)
        throw std::runtime_error("Could not restrict receiver cache permissions");
}

bool validCacheFilename(const std::string& filename) {
    if (filename.size() < 68) return false;
    const auto hash = filename.substr(0, 64);
    const auto extension = filename.substr(64);
    return validHash(hash) &&
        (extension == ".png" || extension == ".jpg" || extension == ".webp");
}

std::unordered_set<std::string> retainedStateFiles(const std::filesystem::path& statePath) {
    std::unordered_set<std::string> files;
    try {
        struct stat stateInfo{};
        if (::lstat(statePath.c_str(), &stateInfo) != 0 || !S_ISREG(stateInfo.st_mode)) return files;
        std::ifstream input(statePath);
        if (!input) return files;
        Json state;
        input >> state;
        if (!state.contains("retainedPreviousFiles") ||
            !state["retainedPreviousFiles"].is_array()) return files;
        for (const auto& item : state["retainedPreviousFiles"]) {
            if (!item.is_string()) continue;
            const auto filename = item.get<std::string>();
            if (validCacheFilename(filename)) files.insert(filename);
        }
    } catch (...) {
        // A corrupt old manifest must not block a fresh synchronization.
    }
    return files;
}

void pruneUnreferencedFiles(
    const std::filesystem::path& mediaRoot,
    const std::unordered_set<std::string>& retainedFiles
) {
    std::error_code iterationError;
    std::filesystem::directory_iterator entry(mediaRoot, iterationError);
    const std::filesystem::directory_iterator end;
    while (!iterationError && entry != end) {
        if (!retainedFiles.contains(entry->path().filename().string())) {
            std::error_code ignored;
            std::filesystem::remove(entry->path(), ignored);
        }
        entry.increment(iterationError);
    }
}

void atomicWrite(const std::filesystem::path& target, const std::string& bytes) {
    const auto temporary = target.string() + ".tmp-" + std::to_string(static_cast<long long>(::getpid()));
    const int fd = ::open(temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR);
    if (fd < 0) throw std::runtime_error("Could not create temporary cache file");
    std::size_t offset = 0;
    bool ok = true;
    while (offset < bytes.size()) {
        const auto written = ::write(fd, bytes.data() + offset, bytes.size() - offset);
        if (written < 0 && errno == EINTR) continue;
        if (written <= 0) { ok = false; break; }
        offset += static_cast<std::size_t>(written);
    }
    if (ok && ::fsync(fd) != 0) ok = false;
    if (::close(fd) != 0) ok = false;
    if (!ok || ::rename(temporary.c_str(), target.c_str()) != 0) {
        ::unlink(temporary.c_str());
        throw std::runtime_error("Could not atomically commit receiver cache file");
    }

    const auto parent = target.parent_path().empty()
        ? std::filesystem::path(".") : target.parent_path();
    const int directory = ::open(parent.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (directory < 0) {
        throw std::runtime_error("Could not open receiver cache directory for synchronization");
    }
    const bool directorySynced = ::fsync(directory) == 0;
    const bool directoryClosed = ::close(directory) == 0;
    if (!directorySynced || !directoryClosed) {
        throw std::runtime_error("Could not synchronize receiver cache directory metadata");
    }
}

SyncSnapshot parseState(const Json& state, const std::filesystem::path& root, bool verify) {
    SyncSnapshot snapshot;
    if (state.value("schemaVersion", 0) != 1) return snapshot;
    snapshot.configVersion = state.value("configVersion", 0);
    snapshot.ndiSourceName = state.value("ndiSourceName", "");
    snapshot.ndiSourceAddress = state.value("ndiSourceAddress", "");
    snapshot.fallbackPlaylistId = state.value("fallbackPlaylistId", "");
    snapshot.playlistRevision = state.value("playlistRevision", 0);
    if (snapshot.configVersion < 0 || snapshot.playlistRevision < 0) return {};
    if (!state.contains("items") || !state["items"].is_array() || state["items"].size() > 200) return {};
    std::uint64_t totalBytes = 0;
    for (const auto& item : state["items"]) {
        const auto hash = item.value("sha256", "");
        const auto mime = item.value("mimeType", "");
        const auto size = item.value("sizeBytes", std::uint64_t{0});
        const auto duration = item.value("durationSeconds", 0);
        if (!validHash(hash) || size == 0 || size > 20U * 1024U * 1024U ||
            size > kMaxPlaylistBytes - totalBytes || duration < 1 || duration > 3600)
            return {};
        totalBytes += size;
        const auto file = root / (hash + extensionFor(mime));
        struct stat info{};
        if (::lstat(file.c_str(), &info) != 0 || !S_ISREG(info.st_mode) ||
            static_cast<std::uint64_t>(info.st_size) != size) continue;
        if (verify) {
            std::ifstream input(file, std::ios::binary);
            if (!input) continue;
            std::string bytes((std::istreambuf_iterator<char>(input)), {});
            if (!input.good() && !input.eof()) continue;
            if (sha256(bytes) != hash) continue;
        }
        snapshot.fallbackItems.push_back({
            item.value("mediaId", ""), file, duration, hash
        });
    }
    snapshot.hasValidCachedState = true;
    return snapshot;
}
}  // namespace

ReceiverSync::ReceiverSync(config::ControlPlaneConfig config) : config_(std::move(config)) {}

SyncSnapshot ReceiverSync::loadCached() const {
    try {
        ensurePrivateDirectory(config_.cachePath);
        const auto root = config_.cachePath / "media";
        ensurePrivateDirectory(root);
        const auto statePath = config_.cachePath / "state.json";
        struct stat stateInfo{};
        if (::lstat(statePath.c_str(), &stateInfo) != 0 || !S_ISREG(stateInfo.st_mode)) return {};
        std::ifstream input(statePath);
        if (!input) return {};
        Json state;
        input >> state;
        return parseState(state, root, true);
    } catch (...) {
        return {};
    }
}

SyncSnapshot ReceiverSync::synchronize(const std::string& serverUrl, const std::string& deviceToken,
                                       const std::filesystem::path& caCertificatePath,
                                       const std::stop_token& stopToken) {
    ensurePrivateDirectory(config_.cachePath);
    const auto statePath = config_.cachePath / "state.json";
    const auto previousFiles = previousStateFiles(statePath);
    const auto olderRetainedFiles = retainedStateFiles(statePath);
    const auto mediaRoot = config_.cachePath / "media";
    ensurePrivateDirectory(mediaRoot);
    // Remove leftovers from earlier incomplete syncs while preserving both the
    // active snapshot and the previous snapshot retained during its transition.
    auto protectedFiles = previousFiles;
    protectedFiles.insert(olderRetainedFiles.begin(), olderRetainedFiles.end());
    pruneUnreferencedFiles(mediaRoot, protectedFiles);

    const auto configResponse = get(serverUrl, "/api/v1/receiver/config", deviceToken, caCertificatePath, stopToken);
    if (configResponse.status != 200) throw std::runtime_error("Receiver config request failed (HTTP " + std::to_string(configResponse.status) + ")");
    const Json remoteConfig = Json::parse(configResponse.body);
    if (remoteConfig.value("schemaVersion", 0) != 1) throw std::runtime_error("Unsupported receiver config schema");
    const int configVersion = remoteConfig.at("configVersion").get<int>();
    if (configVersion < 0) throw std::runtime_error("Server returned an invalid receiver config version");
    const auto ndi = remoteConfig.at("ndi");
    const auto optionalString = [](const Json& object, const char* key) {
        if (!object.contains(key) || object.at(key).is_null()) return std::string{};
        if (!object.at(key).is_string()) throw std::runtime_error(std::string("Invalid string field: ") + key);
        return object.at(key).get<std::string>();
    };
    const std::string sourceName = optionalString(ndi, "sourceName");
    const std::string sourceAddress = optionalString(ndi, "sourceAddress");
    if (sourceName.empty() != sourceAddress.empty()) throw std::runtime_error("Server returned an incomplete NDI source assignment");

    const auto manifestResponse = get(serverUrl, "/api/v1/receiver/media-manifest", deviceToken, caCertificatePath, stopToken);
    if (manifestResponse.status != 200) throw std::runtime_error("Receiver media manifest request failed (HTTP " + std::to_string(manifestResponse.status) + ")");
    const Json manifest = Json::parse(manifestResponse.body);
    if (manifest.value("schemaVersion", 0) != 1 || manifest.value("configVersion", -1) != configVersion)
        throw std::runtime_error("Receiver config and media manifest versions do not match");
    if (!manifest.contains("items") || !manifest["items"].is_array() || manifest["items"].size() > 200)
        throw std::runtime_error("Receiver media manifest has an invalid item list");

    Json committedItems = Json::array();
    SyncSnapshot snapshot;
    snapshot.configVersion = configVersion;
    snapshot.ndiSourceName = sourceName;
    snapshot.ndiSourceAddress = sourceAddress;
    snapshot.fallbackPlaylistId = optionalString(manifest, "playlistId");
    snapshot.playlistRevision = manifest.contains("playlistRevision") &&
        manifest.at("playlistRevision").is_number_integer()
        ? manifest.at("playlistRevision").get<int>() : 0;
    if (snapshot.playlistRevision < 0) throw std::runtime_error("Server returned an invalid playlist revision");

    std::uint64_t totalPlaylistBytes = 0;
    for (const auto& item : manifest["items"]) {
        const auto mediaId = item.at("mediaId").get<std::string>();
        const auto hash = item.at("sha256").get<std::string>();
        const auto mime = item.at("mimeType").get<std::string>();
        const auto size = item.at("sizeBytes").get<std::uint64_t>();
        const int duration = item.at("durationSeconds").get<int>();
        const auto path = item.at("downloadPath").get<std::string>();
        if (!validMediaId(mediaId) || !validHash(hash) || size == 0 ||
            size > 20U * 1024U * 1024U ||
            size > kMaxPlaylistBytes - totalPlaylistBytes ||
            duration < 1 || duration > 3600 || path != "/api/v1/receiver/media/" + mediaId)
            throw std::runtime_error("Receiver media manifest contains invalid metadata or exceeds the 512 MiB cache limit");
        totalPlaylistBytes += size;
        const auto extension = extensionFor(mime);
        const auto destination = mediaRoot / (hash + extension);
        bool cached = false;
        struct stat info{};
        if (::lstat(destination.c_str(), &info) == 0 && S_ISREG(info.st_mode) &&
            static_cast<std::uint64_t>(info.st_size) == size) {
            std::ifstream cachedFile(destination, std::ios::binary);
            const std::string cachedBytes((std::istreambuf_iterator<char>(cachedFile)), {});
            cached = cachedFile.good() || cachedFile.eof();
            cached = cached && sha256(cachedBytes) == hash;
        }
        if (!cached) {
            const auto mediaResponse = get(serverUrl, path, deviceToken, caCertificatePath, stopToken);
            if (mediaResponse.status != 200 || mediaResponse.body.size() != size ||
                sha256(mediaResponse.body) != hash)
                throw std::runtime_error("Media download failed integrity verification for " + mediaId);
            atomicWrite(destination, mediaResponse.body);
        }
        committedItems.push_back({
            {"mediaId", mediaId}, {"sha256", hash}, {"mimeType", mime},
            {"sizeBytes", size}, {"durationSeconds", duration}
        });
        snapshot.fallbackItems.push_back({mediaId, destination, duration, hash});
    }
    snapshot.hasValidCachedState = true;
    Json retainedPrevious = Json::array();
    for (const auto& filename : previousFiles) retainedPrevious.push_back(filename);
    Json state = {
        {"schemaVersion", 1}, {"configVersion", configVersion},
        {"ndiSourceName", sourceName}, {"ndiSourceAddress", sourceAddress},
        {"fallbackPlaylistId", snapshot.fallbackPlaylistId},
        {"playlistRevision", snapshot.playlistRevision}, {"items", committedItems},
        {"retainedPreviousFiles", retainedPrevious}
    };
    atomicWrite(statePath, state.dump(2));

    // Keep the previous snapshot's files until the main playback loop has
    // observed the new snapshot. A later successful sync prunes that old set.
    std::unordered_set<std::string> retainedFiles = previousFiles;
    for (const auto& item : snapshot.fallbackItems) retainedFiles.insert(item.path.filename().string());
    pruneUnreferencedFiles(mediaRoot, retainedFiles);
    return snapshot;
}

}  // namespace veyra::control_plane
