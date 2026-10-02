cmake_minimum_required(VERSION 3.20)
project(approach LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
enable_testing()
add_library(physics src/physics.cpp)
target_include_directories(physics PUBLIC src)
target_compile_options(physics PRIVATE -Wall -Wextra -Werror -ffp-contract=off)
add_executable(physics-test tests/physics_test.cpp)
target_link_libraries(physics-test PRIVATE physics)
add_test(NAME physics COMMAND physics-test)
find_package(Boost CONFIG REQUIRED COMPONENTS json)
add_library(game src/game.cpp)
target_link_libraries(game PUBLIC physics Boost::json)
target_compile_options(game PRIVATE -Wall -Wextra -Werror)
add_executable(game-test tests/game_test.cpp)
target_link_libraries(game-test PRIVATE game)
add_test(NAME game COMMAND game-test)
find_package(Threads REQUIRED)
add_executable(approach src/server.cpp)
target_link_libraries(approach PRIVATE game Threads::Threads)
target_compile_options(approach PRIVATE -Wall -Wextra -Werror)
add_executable(trajectory tests/trajectory.cpp)
target_link_libraries(trajectory PRIVATE physics)
find_program(NODE NAMES node REQUIRED)
add_test(NAME network COMMAND ${NODE} ${CMAKE_SOURCE_DIR}/tests/network_test.mjs
    $<TARGET_FILE:approach> ${CMAKE_BINARY_DIR}/web)
add_test(NAME wasm-parity COMMAND ${NODE} ${CMAKE_SOURCE_DIR}/tests/wasm_test.mjs
    ${CMAKE_BINARY_DIR}/web/physics.wasm $<TARGET_FILE:trajectory>)
find_program(WASM_CLANG NAMES clang++ REQUIRED)
find_program(WASM_LINKER NAMES wasm-ld REQUIRED)
file(MAKE_DIRECTORY ${CMAKE_BINARY_DIR}/web)
add_custom_command(OUTPUT ${CMAKE_BINARY_DIR}/web/physics.wasm
    COMMAND ${WASM_CLANG} --target=wasm32 -std=c++17 -O2 -ffp-contract=off
        -nostdlib -fno-exceptions -fno-rtti -fno-builtin
        -Wl,--no-entry -Wl,--export=reset_flight -Wl,--export=component
        -Wl,--export=restore -Wl,--export=step_flight
        -Wl,--export=flight_alignment -Wl,--export=flight_spin
        -Wl,--export=judge_flight
        -Wl,--allow-undefined -Wl,-z,stack-size=65536
        --ld-path=${WASM_LINKER}
        ${CMAKE_SOURCE_DIR}/src/physics.cpp ${CMAKE_SOURCE_DIR}/src/wasm.cpp
        -o ${CMAKE_BINARY_DIR}/web/physics.wasm
    DEPENDS src/physics.cpp src/physics.hpp src/wasm.cpp VERBATIM)
add_custom_target(wasm ALL DEPENDS ${CMAKE_BINARY_DIR}/web/physics.wasm)
add_custom_target(web ALL
    COMMAND ${CMAKE_COMMAND} -E copy_directory ${CMAKE_SOURCE_DIR}/web ${CMAKE_BINARY_DIR}/web
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/web/vendor
    COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_SOURCE_DIR}/node_modules/three/build/three.module.js
        ${CMAKE_SOURCE_DIR}/node_modules/three/build/three.core.js ${CMAKE_BINARY_DIR}/web/vendor
    DEPENDS wasm)
