/**
 * Shared test utilities for mocking fetch in Bun tests.
 *
 * Bun's `mock()` return type is missing the `preconnect` property that Bun's
 * own `typeof fetch` requires. This is a known type mismatch in bun-types.
 * We centralize the workaround here so test files stay clean and type-safe.
 */
import type { Mock } from "bun:test";
import { mock } from "bun:test";

type FetchImpl = (
	...args: Parameters<typeof fetch>
) => ReturnType<typeof fetch>;
type FetchMock = Mock<FetchImpl> & typeof fetch;

/**
 * Replace globalThis.fetch with a Bun mock that returns the given implementation.
 * Returns the mock for direct inspection (e.g. `.mock.calls`).
 */
export function mockFetch(impl: FetchImpl): FetchMock {
	const mocked = mock(impl) as unknown as FetchMock;
	globalThis.fetch = mocked;
	return mocked;
}

/**
 * Access the Bun mock metadata (.mock.calls, etc.) from the current globalThis.fetch.
 */
export function fetchMock(): FetchMock {
	return globalThis.fetch as unknown as FetchMock;
}

/**
 * Get the arguments from the most recent fetch call.
 * Returns [input, init] where init contains headers, body, etc.
 * Throws if no calls have been made (fail-fast in tests).
 */
export function lastFetchCall(): [RequestInfo | URL, RequestInit] {
	const calls = fetchMock().mock.calls;
	const call = calls[calls.length - 1];
	if (!call) throw new Error("Expected fetch to have been called");
	return [call[0], call[1] ?? {}];
}
