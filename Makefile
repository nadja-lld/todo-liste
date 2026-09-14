.PHONY: help install run test lint format check build clean icons

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci

run: ## Start development server
	npm run dev -- --host

test: ## Run tests
	npm test

lint: ## Run linter, formatter check and type check
	npm run lint
	npm run typecheck

format: ## Format code
	npm run format

check: lint test ## Run lint + test

build: ## Production build
	npm run build

clean: ## Remove build artifacts
	rm -rf dist dev-dist coverage

icons: ## Regenerate PWA icons from public/icon.svg
	./scripts/generate-icons.sh
