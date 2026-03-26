# My Mind


https://github.com/ondras/my-mind


- アプリ側がSchemeやホスト名を知る必要はない。それらはリバースProxyに責任

## Makefile

- static/my-mind.jsをsrcから生成する。中間ファイルは.jsに保存される。
- nix-shellに入ってから、make。
- 生成物を削除するには、make clean。
