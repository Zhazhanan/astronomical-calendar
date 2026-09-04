#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_page="$project_dir/tiangan_dizhi_cycle.html"
source_lunar="$project_dir/vendor/lunar/lunar.js"
output_dir="$project_dir/dist"
archive="$output_dir/tiangan-dizhi-cycle-nginx.tar.gz"
stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/tiangan-dizhi-cycle.XXXXXX")

cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT HUP INT TERM

if [ ! -f "$source_page" ] || [ ! -f "$source_lunar" ]; then
  echo "找不到页面或 lunar.js 依赖，无法打包。" >&2
  exit 1
fi

mkdir -p "$stage_dir/vendor/lunar" "$output_dir"
cp "$source_page" "$stage_dir/index.html"
cp "$source_lunar" "$stage_dir/vendor/lunar/lunar.js"
LC_ALL=C tar -C "$stage_dir" -czf "$archive" index.html vendor

echo "已生成：$archive"
echo "解压后将 index.html 和 vendor/ 放到 Nginx 网站根目录即可。"
