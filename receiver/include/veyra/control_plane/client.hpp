#pragma once

#include "veyra/config/config.hpp"
#include "veyra/control_plane/sync.hpp"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace veyra::control_plane {

struct ReportedSource {
    std::string name;
    std::string url;
};

struct PlaybackSnapshot {
    std::string mode{"idle"};
    std::string ndiSourceName;
    std::uint64_t uptimeSeconds{0};
    std::vector<ReportedSource> ndiSources;
};

class Client {
public:
    explicit Client(config::ControlPlaneConfig config);
    ~Client();

    Client(const Client&) = delete;
    Client& operator=(const Client&) = delete;

    void start();
    void stop();
    void updateStatus(PlaybackSnapshot snapshot);
    [[nodiscard]] SyncSnapshot syncSnapshot() const;

private:
    struct HttpResponse {
        long status{0};
        std::string body;
        std::string error;
    };

    void run(std::stop_token stopToken);
    void runSync(std::stop_token stopToken, std::string deviceToken);
    [[nodiscard]] bool pair();
    [[nodiscard]] bool sendHeartbeat();
    [[nodiscard]] HttpResponse postJson(
        const std::string& path,
        const std::string& body,
        const std::string& bearerToken = {}
    );
    [[nodiscard]] std::string loadCredential() const;
    void storeCredential(const std::string& token) const;
    void waitFor(std::stop_token stopToken, std::chrono::seconds duration) const;

    config::ControlPlaneConfig config_;
    ReceiverSync sync_;
    mutable std::mutex syncMutex_;
    SyncSnapshot syncSnapshot_;
    std::string deviceToken_;
    std::string deviceId_;
    int heartbeatIntervalSeconds_{15};
    std::uint64_t syncGeneration_{0};
    std::chrono::steady_clock::time_point startedAt_;
    std::mutex snapshotMutex_;
    PlaybackSnapshot snapshot_;
    std::jthread worker_;
    std::jthread syncWorker_;
    std::atomic_bool started_{false};
};

}  // namespace veyra::control_plane
