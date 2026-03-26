{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    pkgs.inotify-tools
    pkgs.nodePackages.typescript
    pkgs.esbuild
    pkgs.nodePackages.less
  ];
}
