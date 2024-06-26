FROM node:20@sha256:cb7cd40ba6483f37f791e1aace576df449fc5f75332c19ff59e2c6064797160e

# Configure default locale (important for chrome-headless-shell).
ENV LANG en_US.UTF-8

# Install latest chrome dev package and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this installs the necessary libs to make the bundled version of Chrome that Puppeteer
# installs, work.
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] https://dl-ssl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf libxss1 dbus dbus-x11 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r pptruser && useradd -rm -g pptruser -G audio,video pptruser

# Checks if google-chrome-stable is installed.
# The || true part ensures that the command doesn't fail the build if Chrome isn't found.
RUN which google-chrome-stable || true

USER pptruser

WORKDIR /home/pptruser

COPY --chown=pptruser:pptruser package.json package-lock.json ./

RUN npm install

COPY --chown=pptruser:pptruser prisma ./prisma/

COPY --chown=pptruser:pptruser . .

RUN npx prisma generate

# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true:
# Prevents Puppeteer from downloading Chromium as it will use the installed Chrome.
# ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable:
# Specifies the path to the Chrome executable that Puppeteer should use

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
