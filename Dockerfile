# Based on https://docs.strapi.io/dev-docs/installation/docker

FROM node:18-alpine

# Installing libvips-dev for sharp Compatibility
RUN apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev nasm bash vips-dev git
ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR /opt/
COPY package.json package-lock.json ./
RUN npm install -g node-gyp
RUN npm config set fetch-retry-maxtimeout 600000 -g && npm install --platform=linuxmusl --arch=x64
ENV PATH /opt/node_modules/.bin:$PATH

WORKDIR /opt/app
COPY . .
RUN chown -R node:node /opt/app
USER node

# Fixes the following error:
#
# > Cannot start service: Host version "0.16.17" does not match binary version
# > "0.21.5"
RUN ["npm", "install", "esbuild@latest"]

RUN ["npm", "run", "build"]
EXPOSE 1337
CMD ["npm", "run", "develop"]