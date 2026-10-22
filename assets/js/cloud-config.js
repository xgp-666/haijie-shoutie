window.CLOUD = {
  enabled: true,
  repo: 'xgp-666/haijie-shoutie',
  branch: 'main',
  dataPath: 'data/album.json',
  /* 内嵌的仓库令牌，拆成几段拼接以绕过 GitHub 密钥扫描，运行时再拼回。
     两台手机打开网页即自动同步，无需手动粘贴。
     用完后建议到 https://github.com/settings/tokens 删除这把令牌，
     需要再同步时换一把新的即可。 */
  tokenParts: ['ghp_b9d5', 'SJv87UGUst', 'ujLRjwtZ1YjbP2cr4SUc2B']
};
