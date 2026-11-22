import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ColumnsEditor, ProjectDetailsForm } from "@/components/forms";
import { getI18n } from "@/lib/i18n/server";
import { orNotFound, requireCtx } from "@/lib/session";
import { activeUsers, can, getProject } from "@/server/ctx";
import { projectColumns, projectMemberIds } from "@/server/projects";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "projects.manage")) notFound();
  const { key } = await params;
  const project = await orNotFound(getProject(ctx, { key }));
  const [i, columns, memberIds, people] = await Promise.all([getI18n(), projectColumns(project.id), projectMemberIds(ctx, project.id), activeUsers(ctx)]);
  const { m } = i;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <title>{i.fmt(m.projects.settingsTitle, { name: project.name })}</title>
      <div>
        <Link href={`/projects/${project.key}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={15} aria-hidden /> {project.name}
        </Link>
        <h1 className="page-title">{i.fmt(m.projects.settingsTitle, { name: project.name })}</h1>
      </div>
      <section className="card p-5" aria-labelledby="details">
        <h2 id="details" className="mb-4 section-title">
          {m.projects.details}
        </h2>
        <ProjectDetailsForm
          projectId={project.id}
          people={people}
          initial={{ name: project.name, description: project.description, restricted: project.restricted, memberIds }}
        />
      </section>
      <section className="card p-5" aria-labelledby="columns">
        <h2 id="columns" className="section-title">
          {m.projects.columns}
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">{m.projects.columnsLead}</p>
        <ColumnsEditor
          projectId={project.id}
          columns={columns.map((c) => ({
            id: c.id,
            name: i.columnName(c),
            defaultName: c.name === null && c.defaultKey ? i.columnName(c) : null,
            category: c.category,
            wipLimit: c.wipLimit,
          }))}
        />
      </section>
    </div>
  );
}
