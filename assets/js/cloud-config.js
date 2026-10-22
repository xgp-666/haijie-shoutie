/* ======================================================================
 * 云同步配置：用 GitHub 仓库当云端相册（两台手机、任意设备共享）
 * ----------------------------------------------------------------------
 * 照片和文字都存进仓库里的 data/album.json，任何人打开网页都能读到。
 * 只有「写入（上传/删除/修改）」才需要一把仓库令牌，令牌只存在你手机
 * 浏览器的 localStorage 里，不会写进公开的网页，也不会上传给任何人。
 *
 * 想要更高安全级别，可到 GitHub 生成一个「细粒度令牌」：
 *   Settings → Developer settings → Personal access tokens → Fine-grained
 *   只勾选这一个仓库，权限只给 Contents: Read and write
 * （也可以直接用之前那把经典令牌，用完在 GitHub 删掉即可）
 * ==================================================================== */
window.CLOUD = {
  enabled: true,
  repo: 'xgp-666/haijie-shoutie',
  branch: 'main',
  dataPath: 'data/album.json'
};
