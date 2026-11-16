export type Issue = {
    title: string;
    body: string;
    state?: string;
    labels: string[];
};
export type IssueBodySource = {
    getIssue: (issueNumber: number) => Promise<Issue>;
    setBody: (issueNumber: number, body: string) => Promise<void>;
    comment: (issueNumber: number, body: string) => Promise<void>;
};
export declare function getIssue(issueNumber: number): Promise<Issue>;
export declare function commentOnIssue(issueNumber: number, body: string): Promise<void>;
export declare function setIssueBody(issueNumber: number, body: string): Promise<void>;
export declare function issueIsEpic(issueNumber: number): Promise<boolean>;
export declare const githubIssueSource: IssueBodySource;
//# sourceMappingURL=github-issue.d.mts.map