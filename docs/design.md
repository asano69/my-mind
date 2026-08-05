## 自動バックアップ

- バックエンド側でマインドマップを自動バックアップするようにする。
- マインドマップのSVGサイズは1枚あたり20kbと換算（最低12kb）、最大でも100kbにも満たないだろう。スナップショットを、50世代残したとしても、50*20kb=1mb にしかならない。64世代なら、1.3mbなので、大量のスナップショットをとるのも十分に現実的。

注意するべきなのは、バックアップをとるタイミングで、1日のあいだにとるバックアップと、日単位でとるバックアップを分けて考える必要がある。
日単位のバックアップは、ユーザが編集してないタイミングでとるべきであるが、一日のあいだのバックアップはユーザが編集しているあいだにとるべきものである。
両者を混同するとユーザが編集中の中途半端なタイミングでバックアップがとられて、データとして役に立たないからだ。

データベースには、snapshotsコレクションのなかのtierフィールドでバックアップの種類を分ける。workingとそれ以外を分けることがポイント。
working以外のtierの定期バックアップは、pocketbaseのcronでシンプルに対応できるはずなので、少し難しい編集中のworkingのバックアップのみを考えよう。

### working tier
workingにおいて、1分おきのバックアップを取る場合は、1分前の変更と変化があった場合のみバックアップを取る必要がある。そうしないと、ノイズとなる重複バックアップが増えてしまう。
1分おきに、バックエンド側で、mapsのデータをupdatedが、前回のsnaptshotsのcreated/updateよりも新しいか比較し、新しい場合のみ処理を実行する。
処理を実行する場合は、新しいmapsが最新のsnapshotと比較して変化があった場合のみsnapshotにコピーをとるという二段階の判断が必要だろう。

さらに、スナップショットのローテションも行う必要があるだろう。working tierの保持ポリシーは直近32個でいいだろう。


### 非working tier
保持ポリシー(未決定)
- 8個: 日単位
- 8個: 週単位


## Security Model for SVG Resource Access

This application is intended to operate within a trusted network environment, with authorization enforced at the network layer.

SVG resources are accessible to any party that possesses the corresponding URL.

Resource identifiers are generated using UUIDv7. Because UUIDv7 provides a sufficiently large search space, including approximately 74 bits of unpredictable entropy, discovering valid resource URLs through brute-force enumeration is not considered practically feasible. As a result, the system effectively functions as a capability URL (unguessable URL) mechanism, where access is limited to parties that know the URL.

However, this approach is not an authorization mechanism; it relies on the confidentiality of the URL itself. Consequently, if a URL is disclosed, the associated resource becomes accessible to anyone who obtains it.

Given the intended deployment model—namely, operation within a trusted network and use by a single user or a limited set of users—this approach is considered to provide an acceptable level of practical security for the application.