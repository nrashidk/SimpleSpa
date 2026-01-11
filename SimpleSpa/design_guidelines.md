# Spa Booking System - Design Guidelines

## Design Approach

**Reference-Based Approach**: Drawing inspiration from Fresha, Mindbody, and modern wellness platforms that balance professional functionality with calming aesthetics. The design should evoke serenity and trust while maintaining exceptional usability for booking workflows.

**Key Design Principles**:
- Calming yet professional aesthetic that reflects spa/wellness brand values
- Intuitive booking flow that minimizes friction and decision fatigue
- Clear visual hierarchy guiding users through date → time → staff selection
- Trust-building through transparency in availability and confirmation feedback

## Core Design Elements

### A. Color Palette

**Light Mode**:
- Primary: 210 45% 25% (Deep ocean blue - trust and calm)
- Secondary: 160 35% 95% (Soft mint background - freshness)
- Accent: 210 40% 55% (Lighter blue for interactive elements)
- Surface: 0 0% 98% (Near white for cards and containers)
- Text Primary: 210 25% 15% (Deep blue-gray)
- Text Secondary: 210 15% 45% (Medium gray)
- Success: 145 60% 45% (Calm green for confirmations)
- Border: 210 20% 90% (Subtle blue-gray borders)

**Dark Mode**:
- Primary: 210 50% 65% (Soft blue - maintains calm in dark)
- Secondary: 160 25% 15% (Dark teal background)
- Accent: 210 45% 70% (Bright blue for interactions)
- Surface: 210 20% 12% (Dark blue-gray cards)
- Text Primary: 210 15% 90% (Light blue-white)
- Text Secondary: 210 10% 65% (Muted light gray)

### B. Typography

**Font Stack**:
- Headings: 'Inter' - Clean, professional sans-serif for trust and clarity
- Body: 'Inter' - Consistent reading experience
- Accent/Calendar Numbers: 'DM Sans' - Slightly warmer for humanizing numerical data

**Hierarchy**:
- H1 (Page Headers): text-4xl md:text-5xl font-semibold tracking-tight
- H2 (Section Headers): text-2xl md:text-3xl font-semibold
- H3 (Card Titles): text-xl font-medium
- Body: text-base leading-relaxed
- Small/Labels: text-sm font-medium text-secondary
- Calendar Dates: text-lg font-medium

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, and 16 for consistent rhythm
- Micro spacing (between related elements): p-2, gap-2
- Standard spacing (component padding): p-4, p-6
- Section spacing: py-8, py-12
- Large spacing (between major sections): py-16, gap-16

**Container Strategy**:
- Main booking flow: max-w-6xl mx-auto (accommodates calendar + details)
- Forms/Details panels: max-w-md for focused interactions
- Staff grid: max-w-7xl for spacious card layouts

### D. Component Library

**Navigation**:
- Sticky header with logo, service categories, and account access
- Breadcrumb trail showing booking progress (Date → Time → Staff → Confirm)
- Mobile: Hamburger menu with slide-out drawer

**Calendar Interface**:
- Month view with large, tappable date cells (min 56px height on mobile)
- Available dates: Subtle blue background with bold text
- Selected date: Solid primary color with white text
- Unavailable dates: Grayed out with diagonal line pattern
- Today indicator: Thin border accent

**Time Slot Selection**:
- Grid layout of time buttons (grid-cols-3 md:grid-cols-4 lg:grid-cols-6)
- Available slots: Outlined buttons with hover state showing primary fill
- Booked slots: Disabled state with reduced opacity and strike-through
- Selected slot: Solid primary background with white text
- Display duration next to time (e.g., "2:00 PM · 60 min")

**Staff Cards**:
- Horizontal cards with avatar, name, specialty, and "Select" button
- Show availability indicator (green dot = available, gray = unavailable)
- "Any Available Staff" option prominently displayed as first choice
- Grid layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4

**Forms**:
- Floating labels that elevate on focus
- Input fields with subtle blue border on focus (border-2 border-primary)
- Phone number input with country code selector
- Email field marked as optional with light badge
- Clear validation states (red border + error message below)

**Confirmation Screen**:
- Large success checkmark icon in circle (text-6xl text-success)
- Booking summary card with all details in structured layout
- Prominent "Add to Calendar" button alongside confirmation
- SMS/Email notification status indicators

**Data Display**:
- Customer dashboard with upcoming bookings as timeline cards
- Booking history table with sortable columns
- Staff schedule view using weekly grid layout

### E. Animations

**Strategic Motion** (minimal, purposeful):
- Calendar slide-in transition when changing months (300ms ease-out)
- Time slot selection: Scale 0.98 on click for tactile feedback
- Success confirmation: Checkmark draw animation (500ms)
- Toast notifications: Slide from top with 3-second auto-dismiss

## Images

**Hero Section**: Full-width hero (h-[500px] md:h-[600px]) with serene spa environment - soft-focus image of massage stones on bamboo with subtle water ripples, or minimalist spa treatment room with natural light. Overlay gradient (from-primary/80 to-transparent) for text legibility.

**Service Category Cards**: Square aspect ratio images (1:1) showing specific spa services - facial treatment, massage hands, aromatherapy oils, meditation space. Use consistent filter (slight desaturation + blue tint) for brand cohesion.

**Staff Avatars**: Professional headshots with circular crop (w-16 h-16 md:w-20 md:h-20), soft drop shadow for depth against card backgrounds.

**Empty States**: Illustrative SVG images for "No appointments" or "No availability" - calming lotus flower or zen stones illustration in primary color palette.

**Background Textures**: Subtle organic patterns (bamboo grain, water ripples) at 5% opacity on section backgrounds to enhance spa ambiance without overwhelming.