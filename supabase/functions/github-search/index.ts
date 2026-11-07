import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") ?? "";
    const type = url.searchParams.get("type") ?? "repositories"; // repositories | users

    if (!query.trim()) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ghUrl = type === "users"
      ? `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=6`
      : `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+is:public&sort=stars&per_page=6`;

    const ghRes = await fetch(ghUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Reboot-App/1.0",
        ...(Deno.env.get("GITHUB_TOKEN") ? {
          "Authorization": `Bearer ${Deno.env.get("GITHUB_TOKEN")}`,
        } : {}),
      },
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return new Response(JSON.stringify({ error: "GitHub API error", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await ghRes.json();

    if (type === "users") {
      const items = (data.items ?? []).map((u: Record<string, unknown>) => ({
        id: u.id,
        login: u.login,
        avatar_url: u.avatar_url,
        html_url: u.html_url,
        type: "user",
      }));
      return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (data.items ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
      language: r.language,
      topics: r.topics,
      archived: r.archived,
      owner: { login: (r.owner as Record<string, unknown>)?.login, avatar_url: (r.owner as Record<string, unknown>)?.avatar_url },
      pushed_at: r.pushed_at,
      created_at: r.created_at,
    }));

    return new Response(JSON.stringify({ items, total_count: data.total_count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
