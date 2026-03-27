MAKEOPTS := "-r"
TSC      := tsc
ESBUILD  := esbuild
JS       := .js
FLAG     := $(JS)/.tsflag
APP      := my-mind.js
OUT      := static/$(APP)

# ─────────────────────────────────────────
#  デフォルト：ビルド＆サーバー起動
# ─────────────────────────────────────────
.PHONY: all
all: $(OUT) ## my-mind.js をバンドルしてサーバーを起動
	go run cmd/server/main.go

# ─────────────────────────────────────────
#  ビルドルール
# ─────────────────────────────────────────
$(OUT): $(FLAG)
	$(ESBUILD) --bundle $(JS)/$(APP) > $@

$(FLAG): $(shell find src -type f)
	$(TSC) -p src
	touch $@

# ─────────────────────────────────────────
#  開発
# ─────────────────────────────────────────
.PHONY: watch
watch: $(OUT) ## ソース変更を監視して自動ビルド
	while inotifywait -e MODIFY -r src; do $(MAKE) $(OUT); done

# ─────────────────────────────────────────
#  Docker / デプロイ
# ─────────────────────────────────────────
.PHONY: docker-up
docker-up: ## Docker Compose でビルド＆起動
	docker compose -f docker-compose.dev.yaml up --build --force-recreate

.PHONY: docker-build
docker-build: ## Docker イメージをビルド
	docker build -t registry.internal/my-mind:latest .

.PHONY: docker-push
docker-push: ## Docker イメージをプッシュ
	docker push registry.internal/my-mind:latest

.PHONY: docker-deploy
docker-deploy: docker-build docker-push ## Komodo でスタックをデプロイ
	docker exec -it komodo km x -y destroy-stack mymind
	docker exec -it komodo km x -y pull-stack   mymind
	docker exec -it komodo km x -y deploy-stack mymind

# ─────────────────────────────────────────
#  その他
# ─────────────────────────────────────────
.PHONY: clean
clean: ## ビルド成果物を削除
	rm -rf $(JS)
	rm -f  $(OUT)

.PHONY: help
help: ## 利用可能なターゲット一覧を表示
	@echo "Usage: make [target]"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS=":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
