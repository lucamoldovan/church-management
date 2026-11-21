#include "veyra/ndi/discovery.hpp"

#include <stdexcept>
#include <utility>

namespace veyra::ndi {

std::string Source::identity() const {
    return url.empty() ? name : url;
}

Discovery::Discovery() {
    NDIlib_find_create_t settings{};
    settings.show_local_sources = true;

    instance_ = NDIlib_find_create_v2(&settings);
    if (instance_ == nullptr) {
        throw std::runtime_error("NDI source discovery could not be created");
    }
}

Discovery::~Discovery() {
    if (instance_ != nullptr) {
        NDIlib_find_destroy(instance_);
    }
}

bool Discovery::waitForChanges(const std::uint32_t timeoutMs) {
    return NDIlib_find_wait_for_sources(instance_, timeoutMs);
}

std::vector<Source> Discovery::currentSources() {
    std::uint32_t sourceCount = 0;
    const NDIlib_source_t* ndiSources =
        NDIlib_find_get_current_sources(instance_, &sourceCount);

    std::vector<Source> sources;
    if (ndiSources == nullptr || sourceCount == 0) {
        return sources;
    }

    sources.reserve(sourceCount);
    for (std::uint32_t index = 0; index < sourceCount; ++index) {
        const NDIlib_source_t& ndiSource = ndiSources[index];

        Source source;
        if (ndiSource.p_ndi_name != nullptr) {
            source.name = ndiSource.p_ndi_name;
        }
        if (ndiSource.p_url_address != nullptr) {
            source.url = ndiSource.p_url_address;
        }

        if (!source.name.empty()) {
            sources.push_back(std::move(source));
        }
    }

    // NDI owns ndiSources and may invalidate it on the next finder call.
    // Every string used by Veyra has therefore been copied above.
    return sources;
}

}  // namespace veyra::ndi
