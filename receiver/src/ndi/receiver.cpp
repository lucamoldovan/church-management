#include "veyra/ndi/receiver.hpp"

#include <spdlog/spdlog.h>

#include <cstring>
#include <limits>
#include <stdexcept>
#include <utility>

namespace veyra::ndi {
namespace {

class VideoFrameReleaser {
public:
    VideoFrameReleaser(
        NDIlib_recv_instance_t receiver,
        NDIlib_video_frame_v2_t& frame
    ) : receiver_(receiver), frame_(frame) {}

    ~VideoFrameReleaser() {
        NDIlib_recv_free_video_v2(receiver_, &frame_);
    }

    VideoFrameReleaser(const VideoFrameReleaser&) = delete;
    VideoFrameReleaser& operator=(const VideoFrameReleaser&) = delete;

private:
    NDIlib_recv_instance_t receiver_;
    NDIlib_video_frame_v2_t& frame_;
};

}  // namespace

Receiver::Receiver(Source source) : source_(std::move(source)) {
    if (source_.name.empty()) {
        throw std::invalid_argument("An NDI source name is required");
    }

    NDIlib_source_t ndiSource{};
    ndiSource.p_ndi_name = source_.name.c_str();
    ndiSource.p_url_address =
        source_.url.empty() ? nullptr : source_.url.c_str();

    NDIlib_recv_create_v3_t settings{};
    settings.source_to_connect_to = ndiSource;
    settings.color_format = NDIlib_recv_color_format_UYVY_BGRA;
    settings.bandwidth = NDIlib_recv_bandwidth_highest;
    settings.allow_video_fields = false;
#if defined(VEYRA_NDI_RECV_NAME_FIELD_P_NDI_NAME)
    settings.p_ndi_name = "Veyra Receiver";
#elif defined(VEYRA_NDI_RECV_NAME_FIELD_P_NDI_RECV_NAME)
    settings.p_ndi_recv_name = "Veyra Receiver";
#else
#error "CMake must detect the NDI receiver-name field before compiling"
#endif

    instance_ = NDIlib_recv_create_v3(&settings);
    if (instance_ == nullptr) {
        throw std::runtime_error("NDI receiver could not be created");
    }
}

Receiver::~Receiver() {
    if (instance_ != nullptr) {
        NDIlib_recv_destroy(instance_);
    }
}

bool Receiver::isConnected() const {
    return instance_ != nullptr &&
           NDIlib_recv_get_no_connections(instance_) > 0;
}

std::optional<VideoFrame> Receiver::capture(const std::uint32_t timeoutMs) {
    if (instance_ == nullptr) {
        return std::nullopt;
    }

    NDIlib_video_frame_v2_t ndiFrame{};
    const NDIlib_frame_type_e frameType = NDIlib_recv_capture_v3(
        instance_,
        &ndiFrame,
        nullptr,
        nullptr,
        timeoutMs
    );

    if (frameType != NDIlib_frame_type_video) {
        return std::nullopt;
    }

    VideoFrameReleaser releaser(instance_, ndiFrame);

    if (ndiFrame.p_data == nullptr || ndiFrame.xres <= 0 ||
        ndiFrame.yres <= 0 || ndiFrame.line_stride_in_bytes <= 0) {
        return std::nullopt;
    }

    PixelFormat pixelFormat;
    std::size_t bytesPerPixel = 0;

    switch (ndiFrame.FourCC) {
        case NDIlib_FourCC_type_UYVY:
            pixelFormat = PixelFormat::UYVY;
            bytesPerPixel = 2;
            break;
        case NDIlib_FourCC_type_BGRA:
            pixelFormat = PixelFormat::BGRA;
            bytesPerPixel = 4;
            break;
        default:
            if (!unsupportedFormatLogged_) {
                spdlog::warn(
                    "Skipping unsupported NDI video FourCC: {}",
                    static_cast<unsigned int>(ndiFrame.FourCC)
                );
                unsupportedFormatLogged_ = true;
            }
            return std::nullopt;
    }

    if (pixelFormat == PixelFormat::UYVY && (ndiFrame.xres % 2) != 0) {
        return std::nullopt;
    }

    const auto width = static_cast<std::size_t>(ndiFrame.xres);
    const auto height = static_cast<std::size_t>(ndiFrame.yres);
    const auto stride = static_cast<std::size_t>(ndiFrame.line_stride_in_bytes);
    const std::size_t minimumStride = width * bytesPerPixel;

    constexpr std::size_t maxFrameBytes = 512U * 1024U * 1024U;
    if (stride < minimumStride ||
        height > std::numeric_limits<std::size_t>::max() / stride) {
        return std::nullopt;
    }

    const std::size_t byteCount = stride * height;
    if (byteCount > maxFrameBytes) {
        return std::nullopt;
    }

    VideoFrame frame;
    frame.width = ndiFrame.xres;
    frame.height = ndiFrame.yres;
    frame.stride = ndiFrame.line_stride_in_bytes;
    frame.format = pixelFormat;
    frame.pixels.resize(byteCount);
    std::memcpy(frame.pixels.data(), ndiFrame.p_data, byteCount);

    return frame;
}

}  // namespace veyra::ndi
