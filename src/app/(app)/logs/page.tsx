

'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { AuditLog } from '@/lib/types';
import { format } from 'date-fns';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';


const entityTypes: AuditLog['entityType'][] = ['client', 'account', 'bank_account'];

export default function LogsPage() {
    const [logs, setLogs] = React.useState<AuditLog[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [search, setSearch] = React.useState('');
    const [entityTypeFilter, setEntityTypeFilter] = React.useState('all');

    React.useEffect(() => {
        const logsRef = ref(db, 'logs');
        const unsubscribe = onValue(logsRef, (snapshot) => {
            const data = snapshot.val();
            const list: AuditLog[] = data 
                ? Object.keys(data).map(key => ({ id: key, ...data[key] }))
                : [];
            list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setLogs(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    const filteredLogs = React.useMemo(() => {
        return logs.filter(log => {
            if (entityTypeFilter !== 'all' && log.entityType !== entityTypeFilter) {
                return false;
            }
            if (search) {
                const lowerSearch = search.toLowerCase();
                return (
                    log.entityName?.toLowerCase().includes(lowerSearch) ||
                    log.action.toLowerCase().includes(lowerSearch) ||
                    log.entityId.toLowerCase().includes(lowerSearch) ||
                    log.user.toLowerCase().includes(lowerSearch)
                );
            }
            return true;
        });
    }, [logs, search, entityTypeFilter]);
    
    const clearFilters = () => {
        setSearch('');
        setEntityTypeFilter('all');
    }

    return (
        <>
            <PageHeader
                title="Audit Log"
                description="View a history of all important actions taken in the system."
            />
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap gap-2 items-center">
                        <Input
                          placeholder="Search logs..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="max-w-xs"
                        />
                        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by type..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {entityTypes.map(type => (
                                    <SelectItem key={type} value={type} className="capitalize">{type.replace('_', ' ')}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" onClick={clearFilters}>
                            <X className="mr-2 h-4 w-4" />
                            Clear
                        </Button>
                    </div>
                </CardHeader>
                 <CardContent>
                     <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Timestamp</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Entity</TableHead>
                                    <TableHead>User</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading logs...</TableCell></TableRow>
                                ) : filteredLogs.length > 0 ? (
                                    filteredLogs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell>{format(new Date(log.timestamp), 'Pp')}</TableCell>
                                            <TableCell className="font-mono text-xs">{log.action}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">{log.entityName || log.entityId}</span>
                                                    <span className="text-xs text-muted-foreground">{log.entityType}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{log.user}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No logs found for this criteria.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                 </CardContent>
            </Card>
        </>
    )
}
