FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---

FROM public.ecr.aws/lambda/nodejs:20

# Install Chromium dependencies that are available in AL2023
RUN dnf install -y \
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
      libXScrnSaver \
      libXtst \
      gtk3 \
      wget \
      unzip \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# Download and install Chromium for Lambda (headless shell)
RUN wget -q https://storage.googleapis.com/chrome-for-testing-public/131.0.6778.204/linux64/chrome-headless-shell-linux64.zip \
    && unzip chrome-headless-shell-linux64.zip -d /opt \
    && rm chrome-headless-shell-linux64.zip \
    && chmod +x /opt/chrome-headless-shell-linux64/chrome-headless-shell \
    && ln -s /opt/chrome-headless-shell-linux64/chrome-headless-shell /usr/bin/chromium-browser

ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV XDG_CONFIG_HOME=/tmp/.chromium
ENV XDG_CACHE_HOME=/tmp/.chromium

COPY --from=builder /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY index.mjs ${LAMBDA_TASK_ROOT}/

CMD ["index.handler"]
