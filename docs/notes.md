## Frontend setup with npm
1. Install npm and node in system globally. (Locally also works; specific to `frontend/` directory)
2. Create Next.js app with required features
```
npx create-next-app@latest .\
    --typescript \
    --app \
    --tailwind \
    --eslint \
    --src-dir \
    --import-alias "@/*"
```
3. Install Shadcn UI
```
npx shadcn@latest init
```
4. Configure and customize components using Shadcn CLI (as needed)
```
npx shadcn@latest add <component>
```

## Install Supabase using npm
```
npm install @supabase/supabase-js @supabase/ssr
```

## Font sizes in Next.js
1. text-xs → 0.75rem (12px), leading 1rem
2. text-sm → 0.875rem (14px), leading 1.25rem
3. text-base → 1rem (16px), leading 1.5rem
4. text-lg → 1.125rem (18px), leading 1.75rem
5. text-xl → 1.25rem (20px), leading 1.75rem
6. text-2xl → 1.5rem (24px), leading 2rem
7. text-3xl → 1.875rem (30px), leading 2.25rem
8. text-4xl → 2.25rem (36px), leading 2.5rem
9. text-5xl → 3rem (48px)
10. text-6xl → 3.75rem (60px)
11. text-7xl → 4.5rem (72px)
12. text-8xl → 6rem (96px)
13. text-9xl → 8rem (128px)

## Embedding pipeline worker setup
1. python3 environment/setup.py
2. pm2 start ecosystem.config.js