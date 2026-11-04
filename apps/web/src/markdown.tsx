import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
    </div>
  );
}
