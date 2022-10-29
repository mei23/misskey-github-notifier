# misskey-github-notifier
GitHub notifier for Misskey

## config

config.json
``` json
{
	"port": 3110,
	"hookSecret": "",
	"branch": "master",
	"i": "",
	"instance": "https://misskey.example.com"
}
```

GitHubには `http://notifier.example.com:3110/github` のようなURLをJSONで登録する

```
hookSecret: GitHubのWebHookに登録したSecret
branch: pushイベント補足対象にするブランチ
i: MisskeyのToken
instance: Misskeyインスタンス
```
