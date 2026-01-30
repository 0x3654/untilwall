# Until Wall

**[Read in English](#english) | [Читать на русском](#русский)**

---

Life calendar wallpaper generator for Apple devices (iPhone, iPad, Mac).

Generate personalized life calendar wallpapers that visualize your life journey with beautiful circles - each representing one **day** of your life.

---

<a name="english"></a>

## Features

- 🎨 **Three Visual Styles** - Solid circles, elegant rings, or hearts (for your precious hearts ❤️)
- 📱 **Multi-Device Support** - Optimized presets for iPhone, iPad, and Mac with device-specific overlays
- 🎯 **Widget Compatible** - Reserve space for iOS widgets at the top
- 🖼️ **High Resolution** - Crisp output for Retina displays at device native resolutions
- 📊 **Progress Tracking** - See days remaining, life percentage, and current day highlighted
- 🌗 **Dark Theme** - Perfect for OLED screens with high contrast
- 💾 **Settings Persistence** - Your preferences are saved automatically
- 🔗 **iOS Shortcuts Integration** - Generate wallpapers directly from your iPhone
- 📲 **Responsive Design** - Works seamlessly on mobile and desktop

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Sharp** - High-performance image processing
- **Docker** - Containerized deployment

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/0x3654/untilwall.git
cd untilwall

# Start the container
docker compose up -d

# Open http://localhost:3000
```

### Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Configuration

### Setting Application URL

The application needs to know its public URL to generate correct links for the iOS Shortcuts integration.

**For Docker deployment:**

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set your URL:
   ```bash
   # Local development
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Local network IP
   NEXT_PUBLIC_APP_URL=http://10.0.1.166:3000

   # Production domain
   NEXT_PUBLIC_APP_URL=https://untilwall.0x3654.com
   ```

3. Restart the container:
   ```bash
   docker compose up -d
   ```

**For production deployment (GitHub Actions, etc.):**

Set the `NEXT_PUBLIC_APP_URL` environment variable in your deployment platform:

```yaml
# Example: GitHub Actions
env:
  NEXT_PUBLIC_APP_URL: https://your-domain.com
```

**For Docker Hub / Registry:**

The `.env` file is gitignored, so users can configure their own URL. Document this in your deployment instructions.

## Usage

### Web Interface

1. **Select Device** - Choose your Apple device from presets
2. **Set Date Range** - Enter your birth date and life expectancy
3. **Customize** - Adjust ring style (Solid/Ring/Hearts), widget space, and text display
4. **Generate** - Click "Download Wallpaper" to save your wallpaper
5. **Apply** - Set as wallpaper on your device

### iOS Shortcuts Integration

Automatically generate and update your wallpaper without opening the app:

1. Press **"1. get link"** - copies your personalized configuration to clipboard
2. Press **"2. Get shortcut"** - opens the iCloud Shortcuts link
3. Add the shortcut to your iPhone
4. Run the shortcut - it will generate your wallpaper and prompt to save it
5. Set as wallpaper and enjoy!

Your settings are automatically saved, so the shortcut always uses your latest preferences.

## Visual Styles

### Solid (Filled)
- Past days: Filled white circles ⚪
- Current day: Orange circle 🟠
- Future days: Gray circles ⚫

### Ring (Outline)
- Past days: White outline rings ⭕
- Current day: Orange filled ring 🟠
- Future days: Gray outline rings ⚫

### Hearts
- Past days: White hearts ❤️
- Current day: Orange healing heart ❤️‍🩹
- Future days: Gray broken hearts 💔

*Each circle/heart represents one **day** of your life*

## Device Presets

### iPhone
- iPhone 15 Pro Max / Plus (1290×2796)
- iPhone Xs (1125×2436)

### iPad
- iPad Pro 12.9" Portrait (2048×2732)

### Mac
- MacBook Air 13" (2560×1664)

*More devices can be added easily in `types/index.ts`*

## API Endpoints

### `GET /goal`

Generate PNG calendar image.

**Parameters:**
- `start_date` - Start date (ISO format)
- `end_date` - End date (ISO format)
- `width` - Image width in pixels
- `height` - Image height in pixels
- `offset_top` - Top safe area offset (%)
- `offset_bottom` - Bottom safe area offset (%)
- `offset_left` - Left safe area offset (%)
- `offset_right` - Right safe area offset (%)
- `ring_style` - Ring style: 1 = Solid (filled circles), 0 = Ring (outline), 2 = Hearts
- `show_text` - 1 = show text, 0 = hide
- `has_widgets` - Reserve 15% height for widgets (0 or 1)
- `theme` - Theme (currently: dark)

**Example:**
```
GET /goal?start_date=1990-01-01&end_date=2070-01-01&width=1290&height=2796&ring_style=1&show_text=1
```

## Configuration

### Adding New Devices

Edit `types/index.ts` to add device presets:

```typescript
{
  name: 'Device Name',
  width: 1290,
  height: 2796,
  type: 'iphone',
  orientation: 'portrait',
  circleSize: 56,
  circleGap: 24,
  padding: 20,
  defaultSafeArea: { top: 22, bottom: 25, left: 10, right: 10 }
}
```

### Device Overlays

Place device overlay images in `public/overlay/`:
- `{device}.png` - Without widget space
- `{device}_widget.png` - With widget space

Example: `15promax.png` / `15promax_widget.png` (iPhone 15 Pro Max)

## Deployment

### Docker

```bash
docker compose up -d --build
```

### Environment Variables

- `NODE_ENV` - Set to `production` for deployment
- `NEXT_PUBLIC_APP_URL` - Public URL for generating links (IMPORTANT for iOS Shortcuts)

**Setting NEXT_PUBLIC_APP_URL in CI/CD:**

**GitHub Actions:**
```yaml
- name: Deploy
  run: |
    echo "NEXT_PUBLIC_APP_URL=https://untilwall.0x3654.com" >> $GITHUB_ENV
  env:
    NEXT_PUBLIC_APP_URL: https://untilwall.0x3654.com
```

**Docker Compose (production):**
```yaml
services:
  untilwall:
    env_file:
      - .env
    environment:
      - NEXT_PUBLIC_APP_URL=${APP_URL:-https://untilwall.0x3654.com}
```

Then deploy with:
```bash
export APP_URL=https://untilwall.0x3654.com
docker compose up -d --build
```

## Project Structure

```
untilwall/
├── app/              # Next.js app router
│   ├── page.tsx      # Main UI
│   └── goal/         # API route for image generation
├── components/       # React components
├── public/           # Static assets
│   └── overlay/      # Device overlay images
├── types/            # TypeScript definitions
├── Dockerfile        # Docker image
└── compose.yaml      # Docker compose config
```

## License

MIT License - see [LICENSE](LICENSE) for details.

**Copyright (c) 2025 0x3654**

Free to use, modify, and distribute. Attribution required in copies.

## Author

**0x3654** - [GitHub](https://github.com/0x3654)

## Acknowledgments

Design and concept inspired by [The Life Calendar](https://www.thelifecalendar.com).

Originally popularized by Tim Urban's ["Your Life in Weeks"](https://waitbutwhy.com/2014/05/life-weeks.html) post on the "Wait But Why" blog.

---

<a name="русский"></a>

# Until Wall

**[Read in English](#english) | [Читать на русском](#русский)**

---

Генератор календарных обоев для устройств Apple (iPhone, iPad, Mac).

Создавайте персонализированные календарные обоева, которые визуализируют ваш жизненный путь красивыми кругами — каждый представляет один **день** вашей жизни.

## Возможности

- 🎨 **Три визуальных стиля** - Заполненные круги, элегантные кольца или сердечки (для ваших дорогих сердечек ❤️)
- 📱 **Поддержка множества устройств** - Оптимизированные пресеты для iPhone, iPad и Mac с оверлеями под конкретные устройства
- 🎯 **Совместимость с виджетами** - Резервируйте место для iOS виджетов сверху
- 🖼️ **Высокое разрешение** - Четкий вывод для Retina дисплеев в родном разрешении устройства
- 📊 **Отслеживание прогресса** - Видите оставшиеся дни, процент жизни и текущий день
- 🌗 **Темная тема** - Идеально для OLED экранов с высоким контрастом
- 💾 **Сохранение настроек** - Ваши предпочтения сохраняются автоматически
- 🔗 **Интеграция с iOS Shortcuts** - Генерируйте обои прямо с iPhone
- 📲 **Адаптивный дизайн** - Работает безупречно на мобильных и десктопах

## Технологии

- **Next.js 15** - React фреймворк с App Router
- **TypeScript** - Разработка с типизацией
- **Tailwind CSS** - Utility-first стилизация
- **Sharp** - Высокопроизводительная обработка изображений
- **Docker** - Контейнеризация

## Быстрый старт

### Использование Docker (Рекомендуется)

```bash
# Клонируйте репозиторий
git clone https://github.com/0x3654/untilwall.git
cd untilwall

# Запустите контейнер
docker compose up -d

# Откройте http://localhost:3000
```

### Локальная разработка

```bash
# Установите зависимости
npm install

# Запустите сервер разработки
npm run dev

# Откройте http://localhost:3000
```

## Конфигурация

### Настройка URL приложения

Приложению нужно знать свой публичный URL для генерации правильных ссылок для интеграции с iOS Shortcuts.

**Для Docker развертывания:**

1. Скопируйте `.env.example` в `.env`:
   ```bash
   cp .env.example .env
   ```

2. Отредактируйте `.env` и установите ваш URL:
   ```bash
   # Локальная разработка
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Локальный IP
   NEXT_PUBLIC_APP_URL=http://10.0.1.166:3000

   # Продакшн домен
   NEXT_PUBLIC_APP_URL=https://untilwall.0x3654.com
   ```

3. Перезапустите контейнер:
   ```bash
   docker compose up -d
   ```

**Для продакшн развертывания (GitHub Actions и т.д.):**

Установите переменную окружения `NEXT_PUBLIC_APP_URL` в вашей платформе деплоя:

```yaml
# Пример: GitHub Actions
env:
  NEXT_PUBLIC_APP_URL: https://your-domain.com
```

**Для Docker Hub / Registry:**

Файл `.env` находится в .gitignore, поэтому пользователи могут настроить свой URL. Задокументируйте это в инструкциях по развертыванию.

## Использование

### Веб-интерфейс

1. **Выберите устройство** - Выберите ваше устройство Apple из пресетов
2. **Установите даты** - Введите дату рождения и конечную дату
3. **Настройте** - Выберите стиль (Solid/Ring/Hearts), место для виджетов и отображение текста
4. **Сгенерируйте** - Нажмите "Download Wallpaper" для сохранения обоев
5. **Примените** - Установите как обои на вашем устройстве

### Интеграция с iOS Shortcuts

Автоматически генерируйте и обновляйте обои без открытия приложения:

1. Нажмите **"1. get link"** - копирует вашу персонализированную конфигурацию в буфер обмена
2. Нажмите **"2. Get shortcut"** - открывает ссылку iCloud Shortcuts
3. Добавьте ярлык на ваш iPhone
4. Запустите ярлык - он сгенерирует обои и предложит сохранить их
5. Установите как обои и наслаждайтесь!

Ваши настройки сохраняются автоматически, поэтому ярлык всегда использует ваши последние предпочтения.

## Визуальные стили

### Solid (Заполненные)
- Прошедшие дни: Заполненные белые круги ⚪
- Текущий день: Оранжевый круг 🟠
- Будущие дни: Серые круги ⚫

### Ring (Кольца)
- Прошедшие дни: Белые кольца с обводкой ⭕
- Текущий день: Оранжевое заполненное кольцо 🟠
- Будущие дни: Серые кольца с обводкой ⚫

### Hearts (Сердечки)
- Прошедшие дни: Белые сердечки ❤️
- Текущий день: Оранжевое заживляющее сердечко ❤️‍🩹
- Будущие дни: Серые разбитые сердечки 💔

*Каждый круг/сердечко представляет один **день** вашей жизни*

## Пресеты устройств

### iPhone
- iPhone 15 Pro Max / Plus (1290×2796)
- iPhone Xs (1125×2436)

### iPad
- iPad Pro 12.9" Portrait (2048×2732)

### Mac
- MacBook Air 13" (2560×1664)

*Больше устройств можно легко добавить в `types/index.ts`*

## API эндпоинты

### `GET /goal`

Генерирует PNG изображение календаря.

**Параметры:**
- `start_date` - Начальная дата (формат ISO)
- `end_date` - Конечная дата (формат ISO)
- `width` - Ширина изображения в пикселях
- `height` - Высота изображения в пикселях
- `offset_top` - Верхний отступ безопасной зоны (%)
- `offset_bottom` - Нижний отступ безопасной зоны (%)
- `offset_left` - Левый отступ безопасной зоны (%)
- `offset_right` - Правый отступ безопасной зоны (%)
- `ring_style` - Стиль: 1 = Solid (заполненные круги), 0 = Ring (кольца), 2 = Hearts
- `show_text` - 1 = показывать текст, 0 = скрыть
- `has_widgets` - Резервировать 15% высоты для виджетов (0 или 1)
- `theme` - Тема (сейчас: dark)

**Пример:**
```
GET /goal?start_date=1990-01-01&end_date=2070-01-01&width=1290&height=2796&ring_style=1&show_text=1
```

## Конфигурация

### Добавление новых устройств

Отредактируйте `types/index.ts` для добавления пресетов устройств:

```typescript
{
  name: 'Device Name',
  width: 1290,
  height: 2796,
  type: 'iphone',
  orientation: 'portrait',
  circleSize: 56,
  circleGap: 24,
  padding: 20,
  defaultSafeArea: { top: 22, bottom: 25, left: 10, right: 10 }
}
```

### Оверлеи устройств

Поместите изображения оверлеев в `public/overlay/`:
- `{device}.png` - Без места для виджетов
- `{device}_widget.png` - С местом для виджетов

Пример: `15promax.png` / `15promax_widget.png` (iPhone 15 Pro Max)

## Развертывание

### Docker

```bash
docker compose up -d --build
```

### Переменные окружения

- `NODE_ENV` - Установите в `production` для продакшена
- `NEXT_PUBLIC_APP_URL` - Публичный URL для генерации ссылок (ВАЖНО для iOS Shortcuts)

**Настройка NEXT_PUBLIC_APP_URL в CI/CD:**

**GitHub Actions:**
```yaml
- name: Deploy
  run: |
    echo "NEXT_PUBLIC_APP_URL=https://untilwall.0x3654.com" >> $GITHUB_ENV
  env:
    NEXT_PUBLIC_APP_URL: https://untilwall.0x3654.com
```

**Docker Compose (production):**
```yaml
services:
  untilwall:
    env_file:
      - .env
    environment:
      - NEXT_PUBLIC_APP_URL=${APP_URL:-https://untilwall.0x3654.com}
```

Затем разверните с:
```bash
export APP_URL=https://untilwall.0x3654.com
docker compose up -d --build
```

## Структура проекта

```
untilwall/
├── app/              # Next.js app router
│   ├── page.tsx      # Основной UI
│   └── goal/         # API роут для генерации изображений
├── components/       # React компоненты
├── public/           # Статические файлы
│   └── overlay/      # Оверлеи устройств
├── types/            # TypeScript определения
├── Dockerfile        # Docker образ
└── compose.yaml      # Docker compose конфиг
```

## Лицензия

MIT License - см. [LICENSE](LICENSE) для деталей.

**Copyright (c) 2025 0x3654**

Свободное использование, модификация и распространение. Требуется указание авторства в копиях.

## Автор

**0x3654** - [GitHub](https://github.com/0x3654)

## Благодарности

Дизайн и концепция вдохновлены сайтом [The Life Calendar](https://www.thelifecalendar.com).

Изначально популяризировано в блоге Тима Урбана "Wait But Why" постом ["Your Life in Weeks"](https://waitbutwhy.com/2014/05/life-weeks.html) (Твоя жизнь в неделях).

