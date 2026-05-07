// Password verification API endpoint
// Returns encryption parameters (salt, iv, authTag) for client-side decryption
export const prerender = false; // This makes it a server endpoint

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Get encryption password from environment variable
const ENCRYPTION_PASSWORD = import.meta.env.ENCRYPTION_PASSWORD;

if (!ENCRYPTION_PASSWORD) {
	console.error('ENCRYPTION_PASSWORD environment variable is not set');
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const { postId, password } = await request.json();

		// Get the post from collection
		const posts = await getCollection('essay');
		const post = posts.find((p) => p.id === postId);

		if (!post) {
			return new Response(
				JSON.stringify({ success: false, error: 'Post not found' }),
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Check if post is encrypted
		if (!post.data.encrypted) {
			return new Response(
				JSON.stringify({ success: false, error: 'Post is not encrypted' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Check if encryption password is configured
		if (!ENCRYPTION_PASSWORD) {
			return new Response(
				JSON.stringify({ success: false, error: 'Server configuration error' }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Verify password against environment variable
		if (password !== ENCRYPTION_PASSWORD) {
			return new Response(
				JSON.stringify({ success: false, error: 'Incorrect password' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Password is correct, return encryption parameters for client-side decryption
		// The encrypted content is already in the post data
		const encryptedContent = post.data.encryptedContent;
		
		if (!encryptedContent) {
			return new Response(
				JSON.stringify({ success: false, error: 'Encrypted content not found' }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}

		return new Response(
			JSON.stringify({
				success: true,
				encryptedData: {
					encrypted: encryptedContent.encrypted,
					salt: encryptedContent.salt,
					iv: encryptedContent.iv,
					authTag: encryptedContent.authTag,
					algorithm: encryptedContent.algorithm || 'aes-256-gcm',
					iterations: encryptedContent.iterations || 100000
				}
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ success: false, error: 'Invalid request' }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}
};

// Made with Bob
