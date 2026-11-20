#include <cstddef>
#include <Processing.NDI.Lib.h>

#include "veyra/config/config.hpp"
#include "veyra/control_plane/client.hpp"
#include "veyra/ndi/discovery.hpp"
#include "veyra/ndi/receiver.hpp"
#include "veyra/video/renderer.hpp"

#include <spdlog/spdlog.h>

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <stop_token>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

volatile std::sig_atomic_t shutdownRequested = 0;

void handleShutdownSignal(int) {
    shutdownRequested = 1;
}

int listSources() {
    try {
        veyra::ndi::Discovery discovery;
        const auto discoveryDeadline =
            std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (std::chrono::steady_clock::now() < discoveryDeadline) {
            (void)discovery.waitForChanges(250);
        }
        const auto sources = discovery.currentSources();

        if (sources.empty()) {
            spdlog::warn("No NDI sources found");
            return EXIT_SUCCESS;
        }

        spdlog::info("Found {} NDI source(s):", sources.size());
        for (const auto& source : sources) {
            spdlog::info("Name: {}", source.name);
            spdlog::info("Address: {}", source.identity());
        }
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        spdlog::error("Could not list NDI sources: {}", error.what());
        return EXIT_FAILURE;
    }
}

std::optional<veyra::ndi::Source> selectSource(
    const std::vector<veyra::ndi::Source>& sources,
    const veyra::config::NdiConfig& config,
    const bool allowAutomaticSelection
) {
    if (!config.sourceAddress.empty()) {
        for (const auto& source : sources) {
            if (source.url == config.sourceAddress) {
                return source;
            }
        }
        return std::nullopt;
    }

    if (!config.sourceName.empty()) {
        for (const auto& source : sources) {
            if (source.name == config.sourceName) {
                return source;
            }
        }
        return std::nullopt;
    }

    if (allowAutomaticSelection && sources.size() == 1) {
        return sources.front();
    }

    return std::nullopt;
}

}  // namespace

int main(int argc, char* argv[]) {
    std::filesystem::path configPath = "/etc/veyra/config.json";
    bool listSourcesOnly = false;

    for (int index = 1; index < argc; ++index) {
        const std::string argument = argv[index];
        if (argument == "--help" || argument == "-h") {
            spdlog::info(
                "Usage: veyra [--config /path/to/config.json] [--list-sources]"
            );
            return EXIT_SUCCESS;
        }

        if (argument == "--list-sources") {
            listSourcesOnly = true;
            continue;
        }

        if (argument == "--config" && index + 1 < argc) {
            configPath = argv[++index];
            continue;
        }

        spdlog::error("Unknown or incomplete argument: {}", argument);
        spdlog::info(
            "Usage: veyra [--config /path/to/config.json] [--list-sources]"
        );
        return EXIT_FAILURE;
    }

    std::signal(SIGINT, handleShutdownSignal);
    std::signal(SIGTERM, handleShutdownSignal);

    spdlog::info("Veyra {} starting", "0.1.0");

    if (!NDIlib_initialize()) {
        spdlog::critical("Failed to initialize the NDI runtime");
        return EXIT_FAILURE;
    }

    if (listSourcesOnly) {
        const int listExitCode = listSources();
        NDIlib_destroy();
        return listExitCode;
    }

    int exitCode = EXIT_SUCCESS;
    try {
        const auto config = veyra::config::load(configPath);
        if (!std::filesystem::exists(configPath)) {
            spdlog::warn(
                "Configuration file '{}' was not found; using defaults",
                configPath.string()
            );
        }

        veyra::video::Renderer renderer(config.display);
        veyra::ndi::Discovery discovery;
        std::unique_ptr<veyra::control_plane::Client> controlPlane;
        if (!config.controlPlane.serverUrl.empty()) {
            try {
                controlPlane = std::make_unique<veyra::control_plane::Client>(
                    config.controlPlane
                );
                controlPlane->start();
            } catch (const std::exception& error) {
                spdlog::error("Veyra control plane could not start: {}", error.what());
            }
        }
        std::unique_ptr<veyra::ndi::Receiver> receiver;
        std::mutex latestFrameMutex;
        std::optional<veyra::ndi::VideoFrame> latestFrame;
        std::atomic_bool captureFailed{false};
        std::atomic_bool sourceConnected{false};
        std::jthread captureThread;

        bool displayIsClear = true;
        bool connectionWasActive = false;
        bool playbackWasActive = false;
        bool fallbackVisible = false;
        std::size_t fallbackIndex = 0;
        auto fallbackSlideStartedAt = std::chrono::steady_clock::now();
        int appliedConfigVersion = -1;
        int appliedPlaylistRevision = -1;
        std::uint64_t appliedSyncGeneration = 0;
        std::string appliedFallbackSignature;
        veyra::config::NdiConfig activeNdiConfig = config.ndi;
        std::vector<veyra::control_plane::CachedMediaItem> fallbackItems;
        std::string activeSourceName;
        std::vector<veyra::ndi::Source> currentSources;
        const auto frameInterval =
            std::chrono::duration_cast<std::chrono::steady_clock::duration>(
                std::chrono::duration<double>(1.0 / config.display.targetFps)
            );
        auto nextPresentationAt = std::chrono::steady_clock::now();
        const auto discoveryStartedAt = nextPresentationAt;
        auto sourceSetStableSince = discoveryStartedAt;
        std::string sourceSetSignature;
        auto lastFrameAt = nextPresentationAt;
        auto lastDiscoveryLog = lastFrameAt;
        auto lastSourceSnapshotAt = discoveryStartedAt;
        auto lastControlPlaneReportAt = discoveryStartedAt;

        const auto renderFallback = [&](const std::chrono::steady_clock::time_point now) -> bool {
            if (fallbackItems.empty()) return false;
            if (fallbackVisible) {
                if (now - fallbackSlideStartedAt <
                    std::chrono::seconds(fallbackItems[fallbackIndex].durationSeconds)) {
                    try {
                        renderer.presentImage(fallbackItems[fallbackIndex].path);
                        return true;
                    } catch (const std::exception& error) {
                        spdlog::error("Fallback image redraw failed: {}", error.what());
                        fallbackIndex = (fallbackIndex + 1) % fallbackItems.size();
                    }
                } else {
                    fallbackIndex = (fallbackIndex + 1) % fallbackItems.size();
                }
            }
            for (std::size_t attempt = 0; attempt < fallbackItems.size(); ++attempt) {
                fallbackIndex %= fallbackItems.size();
                try {
                    renderer.presentImage(fallbackItems[fallbackIndex].path);
                    fallbackSlideStartedAt = now;
                    fallbackVisible = true;
                    displayIsClear = false;
                    return true;
                } catch (const std::exception& error) {
                    spdlog::error("Skipping invalid fallback image '{}': {}",
                                  fallbackItems[fallbackIndex].path.string(), error.what());
                    fallbackIndex = (fallbackIndex + 1) % fallbackItems.size();
                }
            }
            fallbackItems.clear();
            fallbackVisible = false;
            return false;
        };

        const auto reportControlPlaneStatus = [&]() {
            if (!controlPlane) return;
            const auto now = std::chrono::steady_clock::now();
            veyra::control_plane::PlaybackSnapshot snapshot;
            snapshot.uptimeSeconds = static_cast<std::uint64_t>(
                std::chrono::duration_cast<std::chrono::seconds>(
                    now - discoveryStartedAt
                ).count()
            );
            snapshot.ndiSourceName = activeSourceName;
            if (captureFailed.load()) {
                snapshot.mode = "error";
            } else if (receiver && sourceConnected.load() &&
                       now - lastFrameAt <= std::chrono::seconds(2)) {
                snapshot.mode = "ndi";
            } else if (fallbackVisible) {
                snapshot.mode = "fallback";
            } else {
                snapshot.mode = "idle";
            }
            snapshot.ndiSources.reserve(currentSources.size());
            for (const auto& source : currentSources) {
                snapshot.ndiSources.push_back({source.name, source.url});
            }
            controlPlane->updateStatus(std::move(snapshot));
        };

        spdlog::info("Waiting for the configured NDI source");

        while (shutdownRequested == 0 && renderer.pollEvents()) {
            const auto loopNow = std::chrono::steady_clock::now();
            if (controlPlane) {
                const auto synchronized = controlPlane->syncSnapshot();
                std::string fallbackSignature;
                for (const auto& item : synchronized.fallbackItems) {
                    fallbackSignature += item.mediaId;
                    fallbackSignature.push_back('\0');
                    fallbackSignature += item.sha256;
                    fallbackSignature.push_back('\0');
                    fallbackSignature += std::to_string(item.durationSeconds);
                    fallbackSignature.push_back('\0');
                }
                const bool repairedFallbackCache =
                    synchronized.syncGeneration != appliedSyncGeneration &&
                    fallbackItems.size() != synchronized.fallbackItems.size();
                if (synchronized.hasValidCachedState &&
                    (synchronized.configVersion != appliedConfigVersion ||
                     synchronized.playlistRevision != appliedPlaylistRevision ||
                     fallbackSignature != appliedFallbackSignature ||
                     repairedFallbackCache)) {
                    const bool sourceChanged =
                        activeNdiConfig.sourceName != synchronized.ndiSourceName ||
                        activeNdiConfig.sourceAddress != synchronized.ndiSourceAddress;
                    activeNdiConfig.sourceName = synchronized.ndiSourceName;
                    activeNdiConfig.sourceAddress = synchronized.ndiSourceAddress;
                    fallbackItems = synchronized.fallbackItems;
                    fallbackIndex = 0;
                    fallbackVisible = false;
                    appliedConfigVersion = synchronized.configVersion;
                    appliedPlaylistRevision = synchronized.playlistRevision;
                    appliedSyncGeneration = synchronized.syncGeneration;
                    appliedFallbackSignature = std::move(fallbackSignature);
                    spdlog::info("Applied receiver config v{} and {} cached fallback image(s)",
                                 appliedConfigVersion, fallbackItems.size());
                    if (sourceChanged && receiver) {
                        if (captureThread.joinable()) {
                            captureThread.request_stop();
                            captureThread.join();
                        }
                        receiver.reset();
                        {
                            std::lock_guard lock(latestFrameMutex);
                            latestFrame.reset();
                        }
                        sourceConnected.store(false);
                        captureFailed.store(false);
                        activeSourceName.clear();
                        playbackWasActive = false;
                        connectionWasActive = false;
                        if (!displayIsClear) {
                            renderer.clear();
                            displayIsClear = true;
                        }
                        sourceSetStableSince = loopNow;
                        sourceSetSignature.clear();
                    }
                }
            }
            if (receiver && loopNow - lastSourceSnapshotAt >= std::chrono::seconds(5)) {
                currentSources = discovery.currentSources();
                lastSourceSnapshotAt = loopNow;
            }
            if (loopNow - lastControlPlaneReportAt >= std::chrono::seconds(1)) {
                reportControlPlaneStatus();
                lastControlPlaneReportAt = loopNow;
            }
            if (!receiver) {
                (void)discovery.waitForChanges(250);
                currentSources = discovery.currentSources();
                lastSourceSnapshotAt = std::chrono::steady_clock::now();
                const auto& sources = currentSources;
                const auto discoveryNow = std::chrono::steady_clock::now();

                std::string currentSourceSet;
                for (const auto& source : sources) {
                    currentSourceSet += source.identity();
                    currentSourceSet.push_back('\0');
                }
                if (currentSourceSet != sourceSetSignature) {
                    sourceSetSignature = std::move(currentSourceSet);
                    sourceSetStableSince = discoveryNow;
                }

                // A managed receiver must never guess which NDI source to display.
                // Automatic single-source selection is only for standalone mode.
                const bool automaticSelectionReady =
                    config.controlPlane.serverUrl.empty() &&
                    discoveryNow - discoveryStartedAt >=
                        std::chrono::seconds(5) &&
                    discoveryNow - sourceSetStableSince >=
                        std::chrono::seconds(2);
                const auto selected = selectSource(
                    sources,
                    activeNdiConfig,
                    automaticSelectionReady
                );

                if (selected.has_value()) {
                    try {
                        spdlog::info(
                            "Connecting to NDI source '{}' [{}]",
                            selected->name,
                            selected->identity()
                        );
                        receiver =
                            std::make_unique<veyra::ndi::Receiver>(*selected);
                        activeSourceName = selected->name;

                        auto* activeReceiver = receiver.get();
                        captureThread = std::jthread(
                            [activeReceiver, &latestFrameMutex, &latestFrame,
                             &captureFailed, &sourceConnected](
                                const std::stop_token stopToken
                            ) {
                                try {
                                    while (!stopToken.stop_requested()) {
                                        auto captured = activeReceiver->capture(100);
                                        sourceConnected.store(
                                            activeReceiver->isConnected()
                                        );
                                        if (captured.has_value()) {
                                            std::lock_guard lock(latestFrameMutex);
                                            latestFrame = std::move(*captured);
                                        }
                                    }
                                } catch (const std::exception& error) {
                                    spdlog::error(
                                        "NDI capture worker failed: {}",
                                        error.what()
                                    );
                                    captureFailed.store(true);
                                }
                            }
                        );

                    lastFrameAt = std::chrono::steady_clock::now();
                    continue;
                    } catch (const std::exception& error) {
                        if (captureThread.joinable()) {
                            captureThread.request_stop();
                            captureThread.join();
                        }
                        receiver.reset();
                        sourceConnected.store(false);
                        activeSourceName.clear();
                        spdlog::error("Could not initialize NDI receiver: {}", error.what());
                        if (!renderFallback(discoveryNow) && !displayIsClear) {
                            renderer.clear();
                            displayIsClear = true;
                        }
                        std::this_thread::sleep_for(std::chrono::seconds(1));
                        continue;
                    }
                }

                const auto now = std::chrono::steady_clock::now();
                if (now - lastDiscoveryLog >= std::chrono::seconds(5)) {
                    if (sources.empty()) {
                        spdlog::info("No NDI sources are currently available");
                    } else if (activeNdiConfig.sourceName.empty() &&
                               activeNdiConfig.sourceAddress.empty()) {
                        spdlog::warn(
                            "Found {} NDI sources; configure sourceName or "
                            "sourceAddress to choose one",
                            sources.size()
                        );
                        for (const auto& source : sources) {
                            spdlog::info(
                                "Available source: {} [{}]",
                                source.name,
                                source.identity()
                            );
                        }
                    } else {
                        spdlog::info(
                            "Configured NDI source is not currently available"
                        );
                    }
                    lastDiscoveryLog = now;
                }

                if (!renderFallback(now) && !displayIsClear) {
                    renderer.clear();
                    displayIsClear = true;
                }
                continue;
            }

            if (captureFailed.load()) {
                spdlog::error("NDI capture worker failed; returning to discovery and fallback playback");
                if (captureThread.joinable()) {
                    captureThread.request_stop();
                    captureThread.join();
                }
                receiver.reset();
                {
                    std::lock_guard lock(latestFrameMutex);
                    latestFrame.reset();
                }
                captureFailed.store(false);
                sourceConnected.store(false);
                activeSourceName.clear();
                playbackWasActive = false;
                connectionWasActive = false;
                sourceSetSignature.clear();
                sourceSetStableSince = loopNow;
                if (!renderFallback(loopNow) && !displayIsClear) {
                    renderer.clear();
                    displayIsClear = true;
                }
                continue;
            }

            const auto now = std::chrono::steady_clock::now();
            std::optional<veyra::ndi::VideoFrame> frame;
            if (now >= nextPresentationAt) {
                std::lock_guard lock(latestFrameMutex);
                if (latestFrame.has_value()) {
                    frame = std::move(latestFrame);
                    latestFrame.reset();
                }
            }

            if (frame.has_value()) {
                nextPresentationAt = now + frameInterval;
                renderer.present(*frame);
                displayIsClear = false;
                fallbackVisible = false;

                if (!playbackWasActive) {
                    spdlog::info(
                        "Video playback started: {}x{}",
                        frame->width,
                        frame->height
                    );
                    playbackWasActive = true;
                }
                lastFrameAt = std::chrono::steady_clock::now();
                continue;
            }

            const auto statusTime = std::chrono::steady_clock::now();
            const bool connected = sourceConnected.load();
            if (connected != connectionWasActive) {
                if (connected) {
                    spdlog::info("NDI source connection established");
                } else {
                    spdlog::warn("NDI source connection lost");
                }
                connectionWasActive = connected;
            }

            const bool frameIsStale =
                statusTime - lastFrameAt > std::chrono::seconds(2);

            if (!connected || frameIsStale) {
                if (playbackWasActive) {
                    spdlog::warn(
                        "NDI video stopped; waiting for the source to recover"
                    );
                    playbackWasActive = false;
                }

                if (!renderFallback(statusTime) && !displayIsClear) {
                    renderer.clear();
                    displayIsClear = true;
                }
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }

        if (captureThread.joinable()) {
            captureThread.request_stop();
            captureThread.join();
        }
    } catch (const std::exception& error) {
        spdlog::critical("Veyra stopped after an error: {}", error.what());
        exitCode = EXIT_FAILURE;
    }

    // All NDI finder and receiver instances are destroyed before the runtime.
    NDIlib_destroy();

    spdlog::info("Veyra shut down");
    return exitCode;
}
