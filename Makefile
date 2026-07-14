MAKEOPTS := "-r"
TSC      := tsc
ESBUILD  := esbuild
JS       := .js
FLAG     := $(JS)/.tsflag
APP      := my-mind.js
OUT      := static/$(APP)
TOAST_JS := static/toast.js

# ─────────────────────────────────────────
#  Default: build & start server
# ─────────────────────────────────────────
.PHONY: all
all: $(OUT) $(TOAST_JS) ## (*) Bundle my-mind.js and start the server
	go run cmd/server/main.go

# ─────────────────────────────────────────
#  Build rules
# ─────────────────────────────────────────
$(OUT): $(FLAG)
	$(ESBUILD) --bundle $(JS)/$(APP) > $@

# toast.js is loaded as a plain ES module by catalog.html and others,
# so it is copied as-is rather than bundled.
$(TOAST_JS): $(FLAG)
	cp $(JS)/ui/toast.js $@

$(FLAG): $(shell find src -type f)
	$(TSC) -p src
	touch $@


# ─────────────────────────────────────────
#  Misc
# ─────────────────────────────────────────
.PHONY: clean
clean: ## Remove build artifacts
	rm -rf $(JS)
	rm -f  $(OUT)
	rm -f  $(TOAST_JS)

.PHONY: help
help: ## Show available targets
	@echo "Usage: make [target]"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS=":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'
