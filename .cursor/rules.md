# Project Rules

## Angular
- Always use Angular Signals (no ngModel)
- Use standalone components
- Follow latest Angular.dev documentation
- Use reactive forms only
- Prefer computed() over manual subscriptions

## NestJS
- Separate domain, application and infrastructure layers
- No business logic inside controllers
- Validate DTOs with class-validator
- Keep services thin and move complex logic to domain layer

## General
- Prefer small pure functions
- Avoid duplicate logic
- Keep naming consistent across BANK and CARD flows
- Always show full diff before applying multi-file changes