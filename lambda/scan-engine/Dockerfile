FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---

FROM public.ecr.aws/lambda/nodejs:20

# Install Chromium and its runtime dependencies.
# Amazon Linux 2023 uses dnf; the chromium package pulls in most deps.
RUN dnf install -y \
      chromium \
      nss \
      atk \
      at-spi2-atk \
      cups-libs \
      libXcomposite \
      libXdamage \
      libXrandr \
      mesa-libgbm \
      pango \
      alsa-lib \
      libdrm \
      libxkbcommon \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# Chromium installed via dnf lands here on AL2023
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
# Suppress shared-memory warnings inside Lambda
ENV XDG_CONFIG_HOME=/tmp/.chromium
ENV XDG_CACHE_HOME=/tmp/.chromium

COPY --from=builder /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY index.mjs ${LAMBDA_TASK_ROOT}/

CMD ["index.handler"]
