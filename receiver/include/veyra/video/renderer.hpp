#pragma once

#include "veyra/config/config.hpp"
#include "veyra/video/frame.hpp"

#include <SDL.h>
#include <SDL_image.h>

#include <cstdint>
#include <filesystem>
#include <vector>

namespace veyra::video {

class Renderer {
public:
    explicit Renderer(const config::DisplayConfig& config);
    ~Renderer();

    Renderer(const Renderer&) = delete;
    Renderer& operator=(const Renderer&) = delete;

    Renderer(Renderer&&) = delete;
    Renderer& operator=(Renderer&&) = delete;

    [[nodiscard]] bool pollEvents();
    void present(const VideoFrame& frame);
    void presentImage(const std::filesystem::path& path);
    void clear();

private:
    [[nodiscard]] bool createTexture(
        int width,
        int height,
        Uint32 format
    );
    void destroyTexture() noexcept;
    [[nodiscard]] bool uploadPixels(
        const std::uint8_t* pixels,
        int sourcePitch,
        int rowBytes,
        int height
    );
    void convertUyvyToBgra(const VideoFrame& frame);

    SDL_Window* window_{nullptr};
    SDL_Renderer* renderer_{nullptr};
    SDL_Texture* texture_{nullptr};
    SDL_Texture* imageTexture_{nullptr};
    std::filesystem::path imagePath_;
    int imageWidth_{0};
    int imageHeight_{0};
    bool imageInitialized_{false};
    bool imageNeedsPresentation_{true};
    int textureWidth_{0};
    int textureHeight_{0};
    Uint32 textureFormat_{SDL_PIXELFORMAT_UNKNOWN};
    bool sdlInitialized_{false};
    bool uyvyTextureUnavailable_{false};
    std::vector<std::uint8_t> conversionBuffer_;
};

}  // namespace veyra::video
