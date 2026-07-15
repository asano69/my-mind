# My Mind
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/asano69/my-mind)

<img src="frontend/public/favicon.svg" width="100" align="right" />

My Mind is a web application for creating and managing Mind maps.  
New to Mind maps? They are useful, aesthetic and cool! Read more about these special diagrams in [the Wikipedia article](https://en.wikipedia.org/wiki/Mind_map).



<img src=".github/assets/sample-01.png" width="800">

## Plan

- [ ] 後回し：Mindmapライブラリを、Solidのリアクティブな状態管理に書き換える。やらなくてよい。


## Work in Progress

マップのパスを変更する
- 現在、http://localhost:3001/?id=2jjelkk3a63m6qo のようにしてマップを開くが、pbへの依存を減らすために、http://localhost:3001/maps/UUID にしようかと思う。
- バックエンドにおいて、エントリをdbに保存するタイミングにフックしてuuidをつけるようにする。


## Ref
- [ondras/my-mind](https://github.com/ondras/my-mind)/ Demo: https://my-mind.github.io/
- “ladigitale/digimindmap: Une application en ligne pour créer des cartes mentales - Codeberg.org”. Codeberg.org, [https://codeberg.org/ladigitale/digimindmap](https://codeberg.org/ladigitale/digimindmap), (Accessed 2026-07-15)
- “BaffinLee/mindmap: Simple online mindmap editor”. GitHub, [https://github.com/BaffinLee/mindmap](https://github.com/BaffinLee/mindmap), (Accessed 2026-07-15)
