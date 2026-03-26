MAKEOPTS := "-r"
TSC := tsc
LESSC := lessc
ESBUILD := esbuild

JS := .js
FLAG := $(JS)/.tsflag
APP := my-mind.js
OUT := static/$(APP)   # ここを追加

all: $(OUT)

# 出力先を static に変更
$(OUT): $(FLAG)
	$(ESBUILD) --bundle $(JS)/$(APP) > $@

$(FLAG): $(shell find src -type f)
	$(TSC) -p src
	touch $@

watch: all
	while inotifywait -e MODIFY -r src ; do $(MAKE) $^ ; done

clean:
	rm -rf $(JS)
	rm -f $(OUT)

.PHONY: all clean watch
