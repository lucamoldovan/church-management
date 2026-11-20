#pragma once

#include <filesystem>
#include <string>

namespace veyra::config {

struct NdiConfig {
    std::string sourceName;
    std::string sourceAddress;
};

struct DisplayConfig {
    int width{1920};
    int height{1080};
    int targetFps{30};
    bool fullscreen{true};
    bool vsync{true};
};

struct ControlPlaneConfig {
    std::string serverUrl;
    std::string deviceName{"Veyra Receiver"};
    std::string pairingCode;
    std::filesystem::path caCertificatePath;
    std::filesystem::path credentialPath;
    std::filesystem::path cachePath;
    int syncIntervalSeconds{10};
    int heartbeatIntervalSeconds{15};
};

struct AppConfig {
    NdiConfig ndi;
    DisplayConfig display;
    ControlPlaneConfig controlPlane;
};

[[nodiscard]] AppConfig load(const std::filesystem::path& path);

}  // namespace veyra::config
