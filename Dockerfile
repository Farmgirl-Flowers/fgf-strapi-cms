# Based on https://docs.strapi.io/dev-docs/installation/docker

#
FROM node:18-alpine AS build
RUN apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev nasm bash vips-dev git
ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR /opt/
COPY package.json package-lock.json ./
# Installing esbuild globally to fix the following error:
#
# > Cannot start service: Host version "0.16.17" does not match binary version
# > "0.21.5"
RUN npm install -g node-gyp esbuild@latest
RUN npm config set fetch-retry-maxtimeout 600000 -g && npm install --platform=linuxmusl --arch=x64
ENV PATH /opt/node_modules/.bin:$PATH
WORKDIR /opt/app
COPY . .
RUN ["npm", "run", "build"]

# Target for development
FROM build AS development
RUN chown -R node:node /opt/app
USER node
EXPOSE 1337
CMD ["npm", "run", "develop"]

# Target for production
FROM node:18-alpine AS production
RUN apk add --no-cache vips-dev
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /opt/app
COPY --from=build /opt/node_modules /opt/node_modules
COPY --from=build /opt/app /opt/app
ENV PATH /opt/node_modules/.bin:$PATH

RUN chown -R node:node /opt/app
USER node
EXPOSE 1337
CMD ["npm", "run", "start"]