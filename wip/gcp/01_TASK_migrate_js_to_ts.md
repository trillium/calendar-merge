# Task 01: Migrate from JavaScript to TypeScript

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 2-3 hours
**Dependencies:** None (First task)

---

## Objective

Convert the `/gcp` directory from JavaScript to TypeScript to maintain consistency with the existing codebase and enable type safety.

## Why This First?

- TypeScript setup affects all other files
- Need tsconfig.json, package.json scripts before writing code
- Easier to write new TS files than convert later

## Current State

```
gcp/
├── package.json          (minimal, no dependencies)
└── src/
    └── **/*.js           (34 skeleton files, 1 line each)
```

## Target State

```
gcp/
├── package.json          (TypeScript dependencies added)
├── tsconfig.json         (new)
├── .gitignore           (new, ignore dist/)
└── src/
    └── **/*.ts           (34 files converted to .ts)
```

## Steps

### 1. Rename all .js files to .ts

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp/src

# Rename all .js files to .ts
find . -name "*.js" -type f | while read file; do
  mv "$file" "${file%.js}.ts"
done

# Verify
find . -name "*.ts" | wc -l  # Should show 34 files
```

### 2. Update package.json

Replace the minimal `gcp/package.json` with:

```json
{
  "name": "calendar-merge-service-gcp",
  "version": "1.0.0",
  "description": "Calendar merge service - Unified Cloud Function",
  "main": "dist/index.js",
  "engines": {
    "node": "22"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@google-cloud/firestore": "^7.10.0",
    "@google-cloud/tasks": "^5.7.0",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "googleapis": "^144.0.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  },
  "keywords": ["calendar", "sync", "google-cloud-functions"],
  "author": "",
  "license": "ISC"
}
```

**Key additions:**
- TypeScript compiler (`typescript`)
- Type definitions (`@types/*`)
- Runtime dependencies (googleapis, firestore, express)
- Build scripts (build, dev, start)

### 3. Create tsconfig.json

Create `gcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Key settings:**
- `target: ES2022` - Modern JavaScript (Node 22)
- `module: commonjs` - Compatible with Cloud Functions
- `outDir: ./dist` - Compiled JS goes here
- `strict: true` - Maximum type safety

### 4. Create .gitignore

Create `gcp/.gitignore`:

```gitignore
# Dependencies
node_modules/
package-lock.json
pnpm-lock.yaml
yarn.lock

# Build output
dist/
*.js
*.js.map
*.d.ts
*.d.ts.map

# Keep important JS files
!jest.config.js

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/
```

### 5. Install dependencies

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
pnpm install
```

### 6. Verify TypeScript setup

```bash
# Test compilation (should succeed with no errors, just empty files)
pnpm build

# Check dist/ was created
ls -la dist/

# Should see compiled .js files for each .ts source file
```

## Validation Checklist

- [ ] All .js files renamed to .ts (34 files)
- [ ] package.json updated with dependencies
- [ ] tsconfig.json created
- [ ] .gitignore created
- [ ] `pnpm install` completes successfully
- [ ] `pnpm build` compiles without errors
- [ ] dist/ directory contains compiled .js files

## Next Task

→ **02_TASK_setup_config_files.md** - Create configuration files (database, google, app)

## Notes

- Don't worry about empty file warnings - we'll populate them in later tasks
- The skeleton .ts files will have TypeScript comments instead of JS comments
- All subsequent tasks assume TypeScript is set up

## Rollback

If needed to revert:
```bash
cd gcp/src
find . -name "*.ts" -type f | while read file; do
  mv "$file" "${file%.ts}.js"
done
```
