#!/usr/bin/env zsh
shopt -s globstar

[[ $1 == "--dry" ]] && \
  dry=1 || \
  dry=0

_zip() {
  dir=$1
  tmp_dir=$2

  mkdir -p /tmp/Backups

  if [[ -z $tmp_dir ]]; then
    tmp_dir="/tmp/Backups/$(basename $dir)"
    tmp_dir_path="$tmp_dir.zip"
  else
    tmp_dir="/tmp/Backups/$tmp_dir"
    tmp_dir_path="$tmp_dir/$(basename $dir).zip"
  fi

  if [[ $dry == 1 ]]; then
    echo "mkdir -p $tmp_dir"
    echo "zip -r $tmp_dir_path $dir"
  else
    mkdir -p $tmp_dir
    zip -r $tmp_dir_path $dir
  fi
}


_clean_and_zip() {
  dir=$1
  tmp_dir=$2
  gitignore="$dir/.gitignore"
  ignored=""

  if [[ -f $gitignore ]]; then
    while IFS= read -r line; do
      stripped_line=$(echo "$line" | xargs)

      if [[ -z "$stripped_line" || "$stripped_line" == \#* ]]; then
        continue
      fi

      ignored+="$stripped_line "
    done < "$gitignore"
  fi

  if [[ -z $ignored ]]; then
    ignored="node_modules dist build"
  fi

  for item in $ignored; do
    if [[ $item == ".env" || $item == ".env.local" ]]; then
      continue
    fi

    item_glob="$dir/**/$item"
    to_delete=$(ls $item_glob 2>/dev/null)

    if [[ $dry == 1 ]]; then
      echo "rm -r $item_glob"
    else
      rm -r $item_glob 2>/dev/null
    fi
  done

  _zip $dir $tmp_dir
}

PROJECTS_DIR=$HOME/Projects
DOCS_DIR=$HOME/Documents
TOOLS_DIR=$HOME/Tools
SCRIPTS_DIR=$HOME/Scripts

if [[ -d $PROJECTS_DIR ]]; then
  projects=$(ls $PROJECTS_DIR)
fi

if [[ -n "$projects" ]]; then
  for dir in $projects; do
    _clean_and_zip "$PROJECTS_DIR/$dir" "Projects"
    [[ $dry == 1 ]] && echo "---"
  done
fi

[[ $dry == 1 ]] && echo "-------------------------"
_clean_and_zip "$DOCS_DIR"
[[ $dry == 1 ]] && echo "-------------------------"
_clean_and_zip "$SCRIPTS_DIR"
[[ $dry == 1 ]] && echo "-------------------------"
_clean_and_zip "$TOOLS_DIR"
[[ $dry == 1 ]] && echo "-------------------------"

mkdir -p /tmp/Backups/Misc

if [[ -f "$HOME/.claude.json" ]]; then
  if [[ $dry == 1 ]]; then
    echo "mv $HOME/.claude.json /tmp/Backups/Misc"
  else
    mv "$HOME/.claude.json" /tmp/Backups/Misc
  fi
fi

if [[ -f "$HOME/.zshenv" ]]; then
  if [[ $dry == 1 ]]; then
    echo "mv $HOME/.zshenv /tmp/Backups/Misc"
  else
    mv "$HOME/.zshenv" /tmp/Backups/Misc
  fi
fi

if [[ -f "$HOME/.zsh_secrets" ]]; then
  if [[ $dry == 1 ]]; then
    echo "mv $HOME/.zsh_secrets /tmp/Backups/Misc"
  else
    mv "$HOME/.zsh_secrets" /tmp/Backups/Misc
  fi
fi

_zip /tmp/Backups/Misc

