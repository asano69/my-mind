{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = [
    pkgs.imagemagick
    pkgs.dejavu_fonts
    pkgs.fontconfig # ←これ重要
  ];
}
# FONT=$(fc-list | grep -i "DejaVuSans-Bold" | head -n1 | cut -d: -f1)
# magick -size 256x256 xc:#000000 \
#  -font "$FONT" \
#  -fill white -pointsize 200 -gravity center \
#  -annotate 0 '?' \
#  -define icon:auto-resize=64,48,32,16 \
#  pwa/favicon.ico
