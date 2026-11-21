#pragma once

#include <cstdint>
#include <vector>

namespace veyra::video {

enum class PixelFormat {
    UYVY,
    BGRA
};

struct VideoFrame {
    int width{0};
    int height{0};
    int stride{0};
    PixelFormat format{PixelFormat::UYVY};
    std::vector<std::uint8_t> pixels;
};

}  // namespace veyra::video
