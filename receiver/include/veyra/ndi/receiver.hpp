#pragma once

#include "veyra/ndi/discovery.hpp"
#include "veyra/video/frame.hpp"

#include <cstdint>
#include <optional>
#include <vector>

namespace veyra::ndi {

using PixelFormat = veyra::video::PixelFormat;
using VideoFrame = veyra::video::VideoFrame;

class Receiver {
public:
    explicit Receiver(Source source);
    ~Receiver();

    Receiver(const Receiver&) = delete;
    Receiver& operator=(const Receiver&) = delete;

    Receiver(Receiver&&) = delete;
    Receiver& operator=(Receiver&&) = delete;

    [[nodiscard]] bool isConnected() const;
    [[nodiscard]] std::optional<VideoFrame> capture(std::uint32_t timeoutMs);

private:
    Source source_;
    NDIlib_recv_instance_t instance_{nullptr};
    bool unsupportedFormatLogged_{false};
};

}  // namespace veyra::ndi
