# .github/workflows - CI Skeleton
# Runs on push to main

# Usage: copy contents into .github/workflows/ci.yml
# (Create when enough code needs testing)

# name: ci
# on: [push, pull_request]
# jobs:
#   test:
#     runs-on: ubuntu-latest
#     steps:
#       - uses: actions/checkout@v4
#       - uses: pnpm/action-setup@v3
#       - uses: actions/setup-node@v4
#         with:
#           node-version: 20
#       - run: pnpm install
#       - run: pnpm run typecheck
#       - run: pnpm run build
