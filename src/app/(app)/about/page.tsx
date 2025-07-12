
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Code2, Cpu, Database, Feather } from "lucide-react";
import { IbnJaberLogo } from "@/components/ibn-jaber-logo";
import { JaibLogo } from "@/components/jaib-logo";

export default function AboutPage() {
    return (
        <div className="space-y-8">
            <PageHeader
                title="About This Application"
                description="An integrated solution for financial CRM and operational management."
            />
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <Users className="h-6 w-6 text-primary" />
                            Developed By
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-2xl font-bold">Ammar Alqurahi</p>
                        <p className="text-muted-foreground">
                            A dedicated software developer passionate about creating efficient, robust, and scalable business solutions.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <Code2 className="h-6 w-6 text-primary" />
                            Technology Stack
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3">
                            <Feather className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="font-semibold">Next.js</p>
                                <p className="text-xs text-muted-foreground">React Framework</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Database className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="font-semibold">Firebase</p>
                                <p className="text-xs text-muted-foreground">Backend & Database</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Cpu className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="font-semibold">Genkit AI</p>
                                <p className="text-xs text-muted-foreground">AI Integration</p>
                            </div>
                        </div>
                         <div className="flex items-center gap-3">
                            <div className="p-1 border rounded-md bg-white">
                               <JaibLogo className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-semibold">ShadCN UI</p>
                                <p className="text-xs text-muted-foreground">Component Library</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
