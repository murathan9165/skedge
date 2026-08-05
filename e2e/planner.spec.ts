import { expect, type Locator, type Page, test } from "@playwright/test";

async function searchFor(page: Page, query: string) {
  await page.getByRole("searchbox", { name: "Search Fall 2026 courses" }).fill(query);
}

async function pointerDrag(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Drag source or target is not visible");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + Math.min(targetBox.width / 2, 280),
    targetBox.y + Math.min(targetBox.height / 3, 320),
    { steps: 12 },
  );
  await page.mouse.up();
}

async function expectFullyVisibleInViewport(locator: Locator) {
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(
    await locator.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const inset = 4;
      const points = [
        [bounds.left + inset, bounds.top + inset],
        [bounds.right - inset, bounds.top + inset],
        [bounds.left + inset, bounds.bottom - inset],
        [bounds.right - inset, bounds.bottom - inset],
      ];
      return points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === element || (hit !== null && element.contains(hit));
      });
    }),
  ).toBe(true);
}

test("click Add, prerequisite disclosure, refresh reset, and static-only runtime", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const externalDataRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.includes("kenyon.edu") || url.origin !== "http://127.0.0.1:3000") {
      externalDataRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("main", { name: "Fall 2026 course planner" })).toBeVisible();
  const drawerBox = await page.getByRole("complementary", { name: "Course search" }).boundingBox();
  const calendarBox = await page.getByRole("region", { name: "Weekly schedule" }).boundingBox();
  expect(
    drawerBox &&
      calendarBox &&
      calendarBox.x + calendarBox.width <= drawerBox.x &&
      calendarBox.width > drawerBox.width,
  ).toBe(true);
  await searchFor(page, "AMST 140");

  const prereqTrigger = page.getByRole("button", { name: "Prereqs for AMST 140", exact: true });
  await prereqTrigger.click();
  const popover = page.getByRole("dialog", { name: "Prerequisites for AMST 140" });
  await expect(popover).toBeVisible();
  await expect(popover).toContainText(/reference material only/i);
  await expect(
    popover.getByRole("link", { name: /official prerequisite source/i }),
  ).toBeVisible();
  const triggerBox = await prereqTrigger.boundingBox();
  const popoverBox = await popover.boundingBox();
  expect(popoverBox && triggerBox && popoverBox.y + popoverBox.height <= triggerBox.y).toBe(true);
  await popover.getByRole("button", { name: "Close prerequisites" }).click();

  await page.getByRole("button", { name: "Add AMST 140", exact: true }).click();
  await expect(page.getByRole("button", { name: "Added AMST 140", exact: true })).toBeDisabled();
  await expect(page.getByRole("article", { name: /amst 140 section 00, wednesday/i })).toBeVisible();
  await expect(page.getByRole("article", { name: /amst 140 section 00, friday/i })).toBeVisible();

  await page.reload();
  await expect(page.locator(".weekly-calendar__event")).toHaveCount(0);
  expect(externalDataRequests).toEqual([]);
});

test("prerequisite popovers remain fully visible at desktop and narrow viewport edges", async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 420 },
    { width: 390, height: 420 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (viewport.width < 500) {
      await page.getByRole("button", { name: "Open course search" }).click();
    }
    await searchFor(page, "PHYS 240");
    const trigger = page.getByRole("button", { name: "Prereqs for PHYS 240", exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const popover = page.getByRole("dialog", { name: "Prerequisites for PHYS 240" });
    await expect(popover).toBeVisible();
    await expectFullyVisibleInViewport(popover);
    await popover.getByRole("button", { name: "Close prerequisites" }).click();
  }
});

test("dragging a scheduled course details surface onto the week adds its official meetings", async ({ page }) => {
  await page.goto("/");
  await searchFor(page, "AMST 140");

  const courseCard = page.locator('[data-section-number="00"]').filter({ hasText: "AMST 140" });
  const details = courseCard.locator(".course-card__details");
  await expect(courseCard).not.toHaveAttribute("role", "button");
  await expect(details).toHaveAttribute("role", "button");
  await expect(details).toHaveAttribute("tabindex", "0");
  await pointerDrag(
    page,
    details,
    page.getByRole("grid", { name: "Monday through Friday class schedule" }),
  );

  await expect(page.getByRole("article", { name: /amst 140 section 00, wednesday, 8:40 am to 10:00 am/i })).toBeVisible();
  await expect(page.getByRole("article", { name: /amst 140 section 00, friday, 8:40 am to 10:00 am/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Added AMST 140", exact: true })).toBeDisabled();
});

test("search aliases return Psychology and Art History course results", async ({ page }) => {
  await page.goto("/");

  await searchFor(page, "psychology");
  await expect(page.getByRole("heading", { name: /PSYC \d+:/ }).first()).toBeVisible();

  await searchFor(page, "art history");
  await expect(page.getByRole("heading", { name: /ARHS \d+:/ }).first()).toBeVisible();
});

test("dragging a course details surface schedules it and its × control removes it", async ({ page }) => {
  await page.goto("/");
  await searchFor(page, "AMST 140");

  const courseCard = page.locator('[data-section-number="00"]').filter({ hasText: "AMST 140" });
  await pointerDrag(
    page,
    courseCard.locator(".course-card__details"),
    page.getByRole("grid", { name: "Monday through Friday class schedule" }),
  );

  await expect(page.getByText("1 section added", { exact: true })).toBeVisible();
  const remove = page.getByRole("button", { name: "Remove AMST 140 section 00" }).first();
  await expect(remove).toHaveText("×");
  expect(await remove.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width >= 24 && bounds.height >= 24;
  })).toBe(true);
  await remove.click();
  await expect(page.getByText("0 sections added", { exact: true })).toBeVisible();
});

test("overlapping sections remain visible with conflict cues and Remove restores Add", async ({ page }) => {
  await page.goto("/");
  await searchFor(page, "ANTH 111");
  await page.locator(".course-card").filter({ hasText: "ANTH 111" }).first().getByRole("button", { name: "Add ANTH 111", exact: true }).click();
  await searchFor(page, "ANTH 112");
  await page.locator(".course-card").filter({ hasText: "ANTH 112" }).first().getByRole("button", { name: "Add ANTH 112", exact: true }).click();

  const conflictEvents = page.locator('.weekly-calendar__event[data-conflict="true"]');
  await expect(conflictEvents).toHaveCount(6);
  await expect(conflictEvents.first().getByRole("status", { name: /conflict with/i })).toContainText("Conflict");
  const firstBox = await conflictEvents.nth(0).boundingBox();
  const secondBox = await conflictEvents.nth(1).boundingBox();
  expect(firstBox && secondBox && firstBox.x !== secondBox.x).toBe(true);

  await page.getByRole("button", { name: "Remove ANTH 111 section 01" }).first().click();
  await searchFor(page, "ANTH 111");
  await expect(page.locator(".course-card").filter({ hasText: "ANTH 111" }).first().getByRole("button", { name: "Add ANTH 111", exact: true })).toBeEnabled();
});

test("untimed sections keep prerequisites but cannot be clicked or dragged into the calendar", async ({ page }) => {
  await page.goto("/");
  await searchFor(page, "AMST 497Y");

  await expect(page.getByText("Time unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add AMST 497Y", exact: true })).toBeDisabled();
  const untimedCard = page.locator('[data-section-number="00"]').filter({ hasText: "AMST 497Y" });
  await expect(untimedCard).not.toHaveAttribute("data-drag-enabled");
  await expect(untimedCard.locator(".course-card__details")).toHaveAttribute("tabindex", "-1");
  await page.getByRole("button", { name: "Prereqs for AMST 497Y", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Prerequisites for AMST 497Y" })).toBeVisible();
  await expect(page.locator(".weekly-calendar__event")).toHaveCount(0);
});

test("search, prerequisites, Add, conflict, and Remove are keyboard operable", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search Fall 2026 courses" });
  await expect(search).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.type("ANTH 111");
  const anth111Card = page.locator('[data-section-number="01"]').filter({ hasText: "ANTH 111" }).first();
  await page.keyboard.press("Tab");
  await expect(anth111Card.locator(".course-card__details")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add ANTH 111", exact: true }).first()).toBeFocused();
  await page.keyboard.press("Tab");
  const prerequisiteTrigger = page.getByRole("button", { name: "Prereqs for ANTH 111", exact: true }).first();
  await expect(prerequisiteTrigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Prerequisites for ANTH 111" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /official prerequisite source/i })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close prerequisites" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("link", { name: /official prerequisite source/i })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(prerequisiteTrigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Prerequisites for ANTH 111" })).toBeHidden();

  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Add ANTH 111", exact: true }).first()).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("ANTH 112");
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-section-number="01"]').filter({ hasText: "ANTH 112" }).first().locator(".course-card__details")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add ANTH 112", exact: true }).first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status", { name: /conflict with anth 112/i }).first()).toBeVisible();

  await page.keyboard.press("Shift+Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("no matching course");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".weekly-calendar__scroll")).toBeFocused();
  await page.keyboard.press("Tab");
  const remove = page.getByRole("button", { name: "Remove ANTH 111 section 01" }).first();
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(remove).toBeHidden();
  await expect(page.getByRole("heading", { name: "Weekly schedule" })).toBeFocused();
});

test("narrow drawer traps keyboard focus and releases it when resized to desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open course search" }).click();
  const drawer = page.locator("#course-search-panel");
  const search = page.getByRole("searchbox", { name: "Search Fall 2026 courses" });
  await expect(page.getByRole("dialog", { name: "Course search drawer" })).toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill("AMST 140");

  const closeDrawer = page.getByRole("button", { name: "Close course search" });
  const prerequisiteTrigger = page.getByRole("button", { name: "Prereqs for AMST 140", exact: true });
  await page.keyboard.press("Shift+Tab");
  await expect(closeDrawer).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(prerequisiteTrigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeDrawer).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(drawer).toBeVisible();
  await expect(drawer).not.toHaveAttribute("aria-modal", "true");
  expect(await drawer.evaluate((element) => element.matches(":modal"))).toBe(false);

  await page.keyboard.press("Tab");
  const amstCard = page.locator('[data-section-number="00"]').filter({ hasText: "AMST 140" });
  await expect(amstCard.locator(".course-card__details")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add AMST 140", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(prerequisiteTrigger).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".weekly-calendar__scroll")).toBeFocused();
});

test("narrow viewport uses a collapsible overlay drawer and a horizontally scrollable week", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const drawer = page.getByRole("complementary", { name: "Course search" });
  await expect(drawer).toBeHidden();
  const openDrawer = page.getByRole("button", { name: "Open course search" });
  await openDrawer.click();
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Course search drawer" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search Fall 2026 courses" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(openDrawer).toBeFocused();
  await openDrawer.click();
  await searchFor(page, "AMST 140");
  await page.getByRole("button", { name: "Add AMST 140", exact: true }).click();
  await page.getByRole("button", { name: "Close course search" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("article", { name: /amst 140 section 00, wednesday/i })).toBeVisible();
  await openDrawer.click();
  await page.mouse.click(385, 800);
  await expect(drawer).toBeHidden();
  await expect(openDrawer).toBeFocused();

  const scrollRegion = page.locator(".weekly-calendar__scroll");
  await expect(scrollRegion).toHaveAttribute("tabindex", "0");
  expect(await scrollRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test("Escape closes a nested prerequisite popover before the narrow drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const openDrawer = page.getByRole("button", { name: "Open course search" });
  await openDrawer.click();
  await searchFor(page, "AMST 140");
  const trigger = page.getByRole("button", { name: "Prereqs for AMST 140", exact: true });
  await trigger.click();
  const popover = page.getByRole("dialog", { name: "Prerequisites for AMST 140" });
  const drawer = page.getByRole("dialog", { name: "Course search drawer" });

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "Search Fall 2026 courses" })).toHaveValue("AMST 140");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(openDrawer).toBeFocused();
});

test("desktop drawer focus moves to its launcher when a resize hides the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search Fall 2026 courses" });
  await search.focus();
  await expect(search).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.getByRole("complementary", { name: "Course search" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open course search" })).toBeFocused();
});
