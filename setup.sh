#!/usr/bin/env zsh

OPT=$HOME/.local/opt

sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y git jq

if [[ $? != 0 ]]; then
  echo "[setup] Install failed, exiting"
  exit 1
fi

if [[ ! -d $OPT || ! -d $HOME/.local/bin ]]; then
  mkdir -p $OPT
  mkdir -p $HOME/.local/bin
  echo "Local dirs were not present; Relog and re-run this script"
  exit 0
fi

# Install gh if missing
if [[ ! -d $OPT/gh-cli ]]; then
  echo "[setup] gh missing, installing..."

  cd /tmp

  gh_release_download_url=$(curl https://api.github.com/repos/cli/cli/releases/latest | jq -r '.assets[] | select(.name | endswith("_linux_amd64.tar.gz")) | .browser_download_url')

  if [[ -d gh-cli-opt ]]; then
    rm -r gh-cli-opt
  fi

  mkdir gh-cli-opt
  wget -O gh-cli.tar.gz $gh_release_download_url
  tar -xvf gh-cli.tar.gz --directory gh-cli-opt --strip-components=1

  mv gh-cli-opt $OPT/gh-cli
  ln -s $OPT/gh-cli/bin/gh $HOME/.local/bin/gh

  cd -

  $HOME/.local/bin/gh auth login --scopes 'admin:public_key'

  if [[ $? != 0 ]]; then
    echo "[setup] Auth failed, exiting"
    exit 1
  fi
fi

# Install mise if missing
if [[ ! -x $HOME/.local/bin/mise ]]; then
  echo "[setup] mise missing, installing..."
  curl https://mise.run | sh
fi

# Clone dotfiles if missing
if [[ ! -d "$HOME/.dotfiles" ]]; then
  echo "[setup] Cloning dotfiles..."
  $HOME/.local/bin/gh repo clone git@github.com:jliocsar/dotfiles.git $HOME/.dotfiles
fi

if [[ $? != 0 ]]; then
  echo "[setup] Repo clone failed, exiting"
  exit 1
fi

# Repo-tracked hooks (pre-push secret scan). core.hooksPath isn't cloned, so set it here.
git -C $HOME/.dotfiles config core.hooksPath .githooks

# Link mise's global config dir (config.toml + tasks/) from dotstorage by hand:
# `dotfiles link` prompts on clobber, and mise has to work before anything else.
if [[ -d $HOME/.config/mise && ! -L $HOME/.config/mise ]]; then
  mv $HOME/.config/mise $HOME/.config/mise.bak
fi
mkdir -p $HOME/.config
ln -sfn $HOME/.dotfiles/dotstorage/.config/mise $HOME/.config/mise

echo "[setup] Installing tools + running setup..."
$HOME/.local/bin/mise run setup

