#!/bin/bash
qecho() { echo -n -e "\e[$2m$1\e[0m"; }

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
USER=$(logname)

TARGET=~/.local/share/cinnamon/desklets

qecho "QRedshift Cinnamon Installation Script! \n" "1"

if [ "$DESKTOP_SESSION" != 'cinnamon' ]; then
  qecho " => "
  qecho "You not running Cinnamon\n" "1;31"
  exit
fi

LAST_VERSION_1=$(curl -sSL "https://api.github.com/repos/raphaelquintao/QSpectrumCinnamon/releases/latest" | sed -n -E 's/.+"tag_name"\s*:\s*"v(.+)".+/\1/p')
LAST_VERSION_2=$(curl -sSL "https://quintao.ninja/qghs/raphaelquintao/QSpectrumCinnamon/releases/latest" | sed -n -E 's/.+"tag_name"\s*:\s*"v(.+)".+/\1/p')

LAST_VERSION=''

if [ "$LAST_VERSION_1" = '' ]; then
  if [ "$LAST_VERSION_2" = '' ]; then
    qecho " => "
    qecho "Failed, check your internet connection.\n" "1;31"
    exit
  else
    LAST_VERSION=$LAST_VERSION_2
  fi
else
  LAST_VERSION=$LAST_VERSION_1
fi

if [ "$LAST_VERSION" = '' ]; then
  qecho " => "
  qecho "Failed, check your internet connection.\n" "1;31"
  exit
fi

FILE_NAME="qspectrum@quintao_$LAST_VERSION.tar.gz"

ZIP_URL="https://github.com/raphaelquintao/QSpectrumCinnamon/releases/download/v$LAST_VERSION/$FILE_NAME"

qecho "Latest Version: " "1:33"
qecho "${LAST_VERSION}\n" "1;33"

#mkdir -p $TARGET

PREVIOUS=false

if [ -d $TARGET/qspectrum@quintao ]; then
  rm -R $TARGET/qspectrum@quintao
  PREVIOUS=true
fi

qecho " => " "1"
qecho "Downloading files..." "0;32"
#curl --progress-bar -o $TARGET/master.tar.gz -L $ZIP
if curl -s -o $TARGET/$LAST_VERSION.tar.gz -L $ZIP_URL; then
  qecho " Done!\n" "1"
else
  qecho "\n => "
  qecho "Failed to download, check your internet connection.\n" "1;31"
  exit
fi

qecho " => " "1";
qecho "Installing..." "0;32"
tar -xzf $TARGET/$LAST_VERSION.tar.gz -C $TARGET
rm $TARGET/$LAST_VERSION.tar.gz
qecho " Done!\n" "1"

if [ "$PREVIOUS" = true ]; then
  qecho " => " "1"
  qecho "Reloading Applet..." "0;32"
  dbus-send --session --dest=org.Cinnamon.LookingGlass --type=method_call /org/Cinnamon/LookingGlass org.Cinnamon.LookingGlass.ReloadExtension string:qspectrum@quintao string:'DESKLET'
  qecho " Done!\n" "1"
else
  qecho " => " "1"
  qecho "Opening Applets Settings..." "0;32"
  setsid cinnamon-settings desklets &>/dev/null &
  qecho " Done!\n" "1"
fi
