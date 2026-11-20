#pragma once

#include "veyra/config/config.hpp"

#include <filesystem>
#include <string>
#include <cstdint>
#include <stop_token>
#include <vector>

namespace veyra::control_plane {

struct CachedMediaItem {
    std::string mediaId;
    std::filesystem::path path;
    int durationSeconds{10};
    std::string sha256;
};

struct SyncSnapshot {
    int configVersion{0};
    std::uint64_t syncGeneration{0};
    std::string ndiSourceName;
    std::string ndiSourceAddress;
    std::string fallbackPlaylistId;
    int playlistRevision{0};
    std::vector<CachedMediaItem> fallbackItems;
    bool hasValidCachedState{false};
};

class ReceiverSync {
public:
    explicit ReceiverSync(config::ControlPlaneConfig config);
    [[nodiscard]] SyncSnapshot loadCached() const;
    [[nodiscard]] SyncSnapshot synchronize(const std::string& serverUrl,
                                             const std::string& deviceToken,
                                             const std::filesystem::path& caCertificatePath,
                                             const std::stop_token& stopToken);
private:
    config::ControlPlaneConfig config_;
};

}  // namespace veyra::control_plane
