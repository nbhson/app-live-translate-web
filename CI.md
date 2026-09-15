# .github/workflows - CI skeleton
# Chạy khi push tới main

# Cách sử dụng: copy nội dung vào .github/workflows/ci.yml
# (Tạo khi có enough code cần test)

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
