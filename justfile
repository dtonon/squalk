dev:
    npm run dev

build:
  npm run build

deploy target: build
  rsync -av --delete --progress build/ {{target}}:~/squalk/
