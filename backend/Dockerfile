###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:22.22.3-alpine As development

RUN apk add --no-cache chromium

# Create app directory
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure copying both package.json AND package-lock.json (when available).
# Copying this first prevents re-running npm install on every code change.
COPY --chown=node:node package*.json ./

# Match the npm version used to create both lockfiles.
RUN npm install --global npm@11.6.2 --no-audit --no-fund && npm ci

# Bundle app source
COPY --chown=node:node . .

# Use the node user from the image (instead of the root user)
USER node

###################
# BUILD FOR PRODUCTION
###################

FROM node:22.22.3-alpine As build

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

# In order to run `npm run build` we need access to the Nest CLI which is a dev dependency. In the previous development stage we ran `npm ci` which installed all dependencies, so we can copy over the node_modules directory from the development image
COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules

COPY --chown=node:node . .

# Run the build command which creates the production bundle
RUN npm run build

# Set NODE_ENV environment variable
ENV NODE_ENV production

# Running `npm ci` removes the existing node_modules directory and passing in --only=production ensures that only the production dependencies are installed. This ensures that the node_modules directory is as optimized as possible
RUN npm install --global npm@11.6.2 --no-audit --no-fund && npm ci --omit=dev && npm cache clean --force

USER node

###################
# SEPARATE ESM AGENT PACKAGE
###################

# Match the agent lockfile toolchain; npm 10 re-resolves incompatible peers.
FROM node:22.22.3-alpine AS agent-base
RUN npm install --global npm@11.6.2 --no-audit --no-fund

FROM agent-base AS agent-build
WORKDIR /usr/src/app/agent
COPY agent/package.json agent/package-lock.json ./
COPY agent/scripts ./scripts
COPY agent/project.inlang ./project.inlang
COPY agent/messages ./messages
# Skip only the development lint/compiler patch, unsupported on Alpine/musl.
# Dependency and postinstall scripts still run; COPY restores the manifest.
RUN npm pkg delete scripts.prepare && npm ci
COPY agent/ ./
COPY src/agent-harness/agent-model.config.ts /usr/src/app/src/agent-harness/agent-model.config.ts
RUN npm run build

FROM agent-base AS agent-runtime-deps
WORKDIR /usr/src/app/agent
COPY agent/package.json agent/package-lock.json ./
# Root prepare/postinstall need build tools; runtime packages have no native builds.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

###################
# PRODUCTION
###################

FROM node:22.22.3-alpine As production

RUN apk add --no-cache chromium su-exec
COPY scripts/link-browser.sh /usr/local/bin/keepintax-link-browser
RUN chmod 0755 /usr/local/bin/keepintax-link-browser

WORKDIR /usr/src/app

# Copy the bundled code from the build stage to the production image
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist
COPY --chown=node:node --from=build /usr/src/app/assets ./assets

COPY --chown=node:node --from=agent-build /usr/src/app/agent/dist ./agent/dist
COPY --chown=node:node --from=agent-runtime-deps /usr/src/app/agent/package.json ./agent/package.json
COPY --chown=node:node --from=agent-runtime-deps /usr/src/app/agent/node_modules ./agent/node_modules
COPY --chown=node:node scripts/check-agent-image.cjs ./scripts/check-agent-image.cjs

# Preserve the original production runtime user, as explicitly requested.
USER root

# Fail the build if the final filesystem cannot load the actual agent contract.
# Keep this legacy-Docker compatible: Cloud Run source deploy does not enable
# BuildKit Dockerfile RUN flags such as --network=none.
RUN node scripts/check-agent-image.cjs

# Start the server using the production build
CMD [ "node", "dist/main.js" ]
