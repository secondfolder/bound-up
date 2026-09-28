#!/usr/bin/env bash
# Builds the image for every published platform and pushes it to GHCR.
#
#   scripts/publish-image.sh <version>
#
# Called by semantic-release (release.config.mjs) with the version it worked
# out, after CI has tested the amd64 build of the same Dockerfile. Needs
# `docker login ghcr.io` and a buildx builder that can emulate arm64 (QEMU),
# which the workflow sets up.
set -euo pipefail

version="${1:?usage: scripts/publish-image.sh <version>}"
# GHCR names must be lower case; GITHUB_REPOSITORY is as the owner typed it.
image="${IMAGE_NAME:-ghcr.io/$(echo "${GITHUB_REPOSITORY:-secondfolder/bound-up}" | tr '[:upper:]' '[:lower:]')}"
minor="${version%.*}"

tags=(--tag "$image:$version" --tag "$image:$minor")
# A prerelease (1.2.0-beta.1) must never become what `latest` pulls.
if [[ "$version" != *-* ]]; then
	tags+=(--tag "$image:latest")
fi

# The GitHub Actions cache is only reachable inside a workflow; locally this
# builds without it.
cache=()
if [[ -n "${ACTIONS_RUNTIME_TOKEN:-}" ]]; then
	cache=(--cache-from type=gha --cache-to "type=gha,mode=max")
fi

echo "Publishing $image:$version for linux/amd64 and linux/arm64"
docker buildx build \
	--platform linux/amd64,linux/arm64 \
	--build-arg "VERSION=$version" \
	"${tags[@]}" \
	"${cache[@]}" \
	--push \
	.
