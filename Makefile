MAKEOPTS := "-r"
TSC := tsc
LESSC := lessc
ESBUILD := esbuild

JS := .js
FLAG := $(JS)/.tsflag
APP := my-mind.js
OUT := static/$(APP)

all: $(OUT) ## my-mind.js を static にバンドル

$(OUT): $(FLAG)
	$(ESBUILD) --bundle $(JS)/$(APP) > $@

$(FLAG): $(shell find src -type f)
	$(TSC) -p src
	touch $@

watch: all ## ソース変更を監視して自動ビルド
	while inotifywait -e MODIFY -r src ; do $(MAKE) $^ ; done

run-server: ## Go サーバーを起動
	go run cmd/server/main.go

docker-up: ## Docker Compose でビルド＆起動
	docker compose up --build --force-recreate

clean: ## ビルド成果物を削除
	rm -rf $(JS)
	rm -f $(OUT)

help: ## 利用可能なターゲット一覧を表示
	@echo "Usage: make [target]"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS=":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

.PHONY: all clean watch run-server docker-up help
