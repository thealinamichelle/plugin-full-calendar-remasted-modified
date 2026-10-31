# Initial Setup

## 1. To Open Terminal and activate Node.js 24
nvm use 24

## 2. Navigate to your plugin repository
cd ~/Developer/plugin-full-calendar-remasted-modified

## 3. Check the installed versions
node -v
pnpm -v

## 4. Compile
	pnpm run compile
	pnpm run prod
	
## information

###
	pnpm run compile
<!-- Checks TypeScript for errors. Does not build or install the plugin. -->
	pnpm run build
<!-- Builds main.js and styles.css. -->
	pnpm run prod
<!-- Runs the TypeScript check, then builds the plugin. -->
	cp main.js styles.css manifest.json "/Users/alinapritchett/vaults/antioch/.obsidian/plugins/full-calendar-remastered-custom/"
<!-- Copies the built plugin files into your actual Obsidian vault. -->

### | pbcopy
<!-- copies to clip board -->

### git diff HEAD -- /path
<!-- shows git changes -->


# After setup, these are for changes

## 1. Check and build:
	pnpm run prod

If it finishes without errors, proceed.

## 2. Install into Obsidian:
	cp main.js styles.css manifest.json "/Users/alinapritchett/vaults/antioch/.obsidian/plugins/full-calendar-remastered-custom/"


## 3. Reload the plugin in Obsidian.
