#pragma once

#include <cstddef>
#include <Processing.NDI.Lib.h>

#include <cstdint>
#include <string>
#include <vector>

namespace veyra::ndi {

struct Source {
    std::string name;
    std::string url;

    [[nodiscard]] std::string identity() const;
};

class Discovery {
public:
    Discovery();
    ~Discovery();

    Discovery(const Discovery&) = delete;
    Discovery& operator=(const Discovery&) = delete;

    Discovery(Discovery&&) = delete;
    Discovery& operator=(Discovery&&) = delete;

    [[nodiscard]] bool waitForChanges(std::uint32_t timeoutMs);
    [[nodiscard]] std::vector<Source> currentSources();

private:
    NDIlib_find_instance_t instance_{nullptr};
};

}  // namespace veyra::ndi
