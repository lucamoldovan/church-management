#include "veyra/config/config.hpp"

#include <nlohmann/json.hpp>

#include <cstdint>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <stdexcept>
#include <string>

namespace veyra::config {
namespace {

using Json = nlohmann::json;

const Json& objectOrEmpty(const Json& parent, const char* key, Json& empty) {
    if (!parent.contains(key)) {
        return empty;
    }

    const Json& value = parent.at(key);
    if (!value.is_object()) {
        throw std::runtime_error(std::string("Configuration section '") +
                                 key + "' must be an object");
    }
    return value;
}

std::string readString(
    const Json& object,
    const char* key,
    const std::string& fallback
) {
    if (!object.contains(key)) {
        return fallback;
    }
    if (!object.at(key).is_string()) {
        throw std::runtime_error(std::string("Configuration value '") +
                                 key + "' must be a string");
    }
    return object.at(key).get<std::string>();
}

int readInteger(
    const Json& object,
    const char* key,
    const int fallback,
    const int minimum,
    const int maximum
) {
    if (!object.contains(key)) {
        return fallback;
    }

    const Json& value = object.at(key);
    if (!value.is_number_integer()) {
        throw std::runtime_error(std::string("Configuration value '") +
                                 key + "' must be an integer");
    }

    if (value.is_number_unsigned()) {
        const auto parsed = value.get<std::uint64_t>();
        if (parsed < static_cast<std::uint64_t>(minimum) ||
            parsed > static_cast<std::uint64_t>(maximum)) {
            throw std::runtime_error(std::string("Configuration value '") +
                                     key + "' is outside its allowed range");
        }
        return static_cast<int>(parsed);
    }

    const auto parsed = value.get<std::int64_t>();
    if (parsed < minimum || parsed > maximum) {
        throw std::runtime_error(std::string("Configuration value '") +
                                 key + "' is outside its allowed range");
    }
    return static_cast<int>(parsed);
}

std::filesystem::path expandHome(const std::string& value) {
    if (value == "~" || value.starts_with("~/")) {
        const char* home = std::getenv("HOME");
        if (home == nullptr || *home == '\0') {
            throw std::runtime_error("HOME is not set; configure an absolute credentialPath");
        }
        if (value == "~") return std::filesystem::path(home);
        return std::filesystem::path(home) / value.substr(2);
    }
    return std::filesystem::path(value);
}

void validateServerUrl(const std::string& url) {
    if (url.empty()) return;
    const auto schemeEnd = url.find("://");
    if (schemeEnd == std::string::npos) {
        throw std::runtime_error("controlPlane.serverUrl must use https:// (or loopback http://)");
    }
    std::string scheme = url.substr(0, schemeEnd);
    std::transform(scheme.begin(), scheme.end(), scheme.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (scheme != "https" && scheme != "http") {
        throw std::runtime_error("controlPlane.serverUrl must use HTTPS");
    }

    const auto authorityStart = schemeEnd + 3;
    const auto authorityEnd = url.find_first_of("/?#", authorityStart);
    const std::string authority = url.substr(
        authorityStart,
        authorityEnd == std::string::npos ? std::string::npos : authorityEnd - authorityStart
    );
    if (authorityEnd != std::string::npos && url.substr(authorityEnd) != "/") {
        throw std::runtime_error("controlPlane.serverUrl must be an origin URL without a path");
    }
    if (authority.empty() || authority.find('@') != std::string::npos) {
        throw std::runtime_error("controlPlane.serverUrl has an invalid authority");
    }
    if (url.find_first_of("?#") != std::string::npos) {
        throw std::runtime_error("controlPlane.serverUrl must not contain a query or fragment");
    }

    if (scheme == "http") {
        std::string host = authority;
        if (host.starts_with("[")) {
            const auto bracket = host.find(']');
            if (bracket != std::string::npos) host = host.substr(0, bracket + 1);
        } else if (const auto colon = host.find(':'); colon != std::string::npos) {
            host = host.substr(0, colon);
        }
        std::transform(host.begin(), host.end(), host.begin(),
                       [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        if (host != "127.0.0.1" && host != "localhost" && host != "[::1]") {
            throw std::runtime_error("Plain HTTP is allowed only for a loopback control-plane URL");
        }
    }
}

bool readBoolean(const Json& object, const char* key, const bool fallback) {
    if (!object.contains(key)) {
        return fallback;
    }
    if (!object.at(key).is_boolean()) {
        throw std::runtime_error(std::string("Configuration value '") +
                                 key + "' must be true or false");
    }
    return object.at(key).get<bool>();
}

}  // namespace

AppConfig load(const std::filesystem::path& path) {
    AppConfig config;
    config.controlPlane.credentialPath = expandHome("~/.local/state/veyra/device-token");
    config.controlPlane.cachePath = expandHome("~/.local/state/veyra/cache");

    if (!std::filesystem::exists(path)) {
        return config;
    }

    std::ifstream input(path);
    if (!input) {
        throw std::runtime_error("Could not open configuration file: " +
                                 path.string());
    }

    Json document;
    try {
        input >> document;
    } catch (const Json::exception& error) {
        throw std::runtime_error("Invalid JSON in configuration file: " +
                                 std::string(error.what()));
    }

    if (!document.is_object()) {
        throw std::runtime_error("Configuration root must be a JSON object");
    }

    (void)readInteger(document, "schemaVersion", 1, 1, 1);

    Json emptyObject = Json::object();
    const Json& ndi = objectOrEmpty(document, "ndi", emptyObject);
    config.ndi.sourceName = readString(ndi, "sourceName", "");
    config.ndi.sourceAddress = readString(ndi, "sourceAddress", "");

    const Json& display = objectOrEmpty(document, "display", emptyObject);
    config.display.width =
        readInteger(display, "width", 1920, 320, 7680);
    config.display.height =
        readInteger(display, "height", 1080, 240, 4320);
    config.display.targetFps =
        readInteger(display, "targetFps", 30, 1, 120);
    config.display.fullscreen =
        readBoolean(display, "fullscreen", true);
    config.display.vsync = readBoolean(display, "vsync", true);

    const Json& controlPlane = objectOrEmpty(document, "controlPlane", emptyObject);
    config.controlPlane.serverUrl = readString(controlPlane, "serverUrl", "");
    while (!config.controlPlane.serverUrl.empty() && config.controlPlane.serverUrl.back() == '/') {
        config.controlPlane.serverUrl.pop_back();
    }
    validateServerUrl(config.controlPlane.serverUrl);
    config.controlPlane.deviceName = readString(controlPlane, "deviceName", "Veyra Receiver");
    if (config.controlPlane.deviceName.empty() || config.controlPlane.deviceName.size() > 64) {
        throw std::runtime_error("controlPlane.deviceName must contain 1 to 64 characters");
    }
    config.controlPlane.pairingCode = readString(controlPlane, "pairingCode", "");
    if (!config.controlPlane.pairingCode.empty() &&
        (config.controlPlane.pairingCode.size() != 12 ||
         !std::all_of(config.controlPlane.pairingCode.begin(), config.controlPlane.pairingCode.end(),
                      [](unsigned char c) { return c >= '0' && c <= '9'; }))) {
        throw std::runtime_error("controlPlane.pairingCode must contain exactly 12 digits");
    }
    const auto caPath = readString(controlPlane, "caCertificatePath", "");
    config.controlPlane.caCertificatePath = caPath.empty()
        ? std::filesystem::path{}
        : expandHome(caPath);
    const auto credentialPath = readString(
        controlPlane, "credentialPath", "~/.local/state/veyra/device-token"
    );
    if (credentialPath.empty()) {
        throw std::runtime_error("controlPlane.credentialPath must not be empty");
    }
    config.controlPlane.credentialPath = expandHome(credentialPath);
    const auto cachePath = readString(controlPlane, "cachePath", "~/.local/state/veyra/cache");
    if (cachePath.empty()) throw std::runtime_error("controlPlane.cachePath must not be empty");
    config.controlPlane.cachePath = expandHome(cachePath);
    config.controlPlane.syncIntervalSeconds = readInteger(controlPlane, "syncIntervalSeconds", 10, 5, 300);
    config.controlPlane.heartbeatIntervalSeconds = readInteger(
        controlPlane, "heartbeatIntervalSeconds", 15, 5, 120
    );

    return config;
}

}  // namespace veyra::config
