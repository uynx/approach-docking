FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ cmake ninja-build clang lld libboost-json1.81-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY CMakeLists.txt ./
COPY src ./src
COPY tests ./tests
COPY web ./web
COPY tools ./tools
RUN cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j2 \
    && ctest --test-dir build --output-on-failure

FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
RUN apt-get update && apt-get install -y --no-install-recommends libboost-json1.81.0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/build/approach ./approach
COPY --from=build /app/build/web ./web
USER 10001:10001
ENV PORT=8080
EXPOSE 8080
CMD ["/app/approach", "--web", "/app/web"]
